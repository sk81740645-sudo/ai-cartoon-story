const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

/* =========================
   DATABASE
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =========================
   ADMIN SESSION SETTINGS
========================= */

const SESSION_SECRET = process.env.SESSION_SECRET;

function createAdminToken() {
  const expires = Date.now() + (24 * 60 * 60 * 1000);

  const data = `admin:${expires}`;

  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(data)
    .digest("hex");

  return Buffer
    .from(`${data}:${signature}`)
    .toString("base64url");
}

function verifyAdminToken(token) {
  try {
    const decoded = Buffer
      .from(token, "base64url")
      .toString("utf8");

    const parts = decoded.split(":");

    if (parts.length !== 3) {
      return false;
    }

    const role = parts[0];
    const expires = Number(parts[1]);
    const signature = parts[2];

    if (role !== "admin") {
      return false;
    }

    if (!expires || Date.now() > expires) {
      return false;
    }

    const data = `${role}:${expires}`;

    const expectedSignature = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(data)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

  } catch (error) {
    return false;
  }
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";

  const parts = cookies.split(";");

  for (const part of parts) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }

  return null;
}

function requireAdmin(req, res, next) {
  const token = getCookie(req, "admin_session");

  if (!token || !verifyAdminToken(token)) {
    return res.status(401).json({
      error: "Admin login required"
    });
  }

  next();
}

/* =========================
   CREATE USERS TABLE
========================= */

async function createUsersTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Users table ready");

  } catch (error) {
    console.error(
      "Database table error:",
      error.message
    );
  }
}

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", async (req, res) => {
  try {

    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
      message: "BaatAI server is running"
    });

  } catch (error) {

    res.status(500).json({
      status: "error",
      database: "not connected",
      error: error.message
    });

  }
});

/* =========================
   SIGN UP
========================= */

app.post("/api/signup", async (req, res) => {
  try {

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error:
          "Name, Email और Password जरूरी हैं।"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error:
          "Password कम से कम 6 अक्षर का होना चाहिए।"
      });
    }

    const cleanEmail =
      email.trim().toLowerCase();

    const existingUser =
      await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [cleanEmail]
      );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error:
          "इस Email से account पहले से मौजूद है।"
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users
       (name, email, password)
       VALUES ($1, $2, $3)`,
      [
        name.trim(),
        cleanEmail,
        hashedPassword
      ]
    );

    res.json({
      success: true,
      message:
        "Account successfully created"
    });

  } catch (error) {

    console.error(
      "SIGNUP ERROR:",
      error
    );

    res.status(500).json({
      error:
        "Account बनाने में समस्या हुई।"
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {
  try {

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error:
          "Email और Password डालें।"
      });
    }

    const cleanEmail =
      email.trim().toLowerCase();

    const result =
      await pool.query(
        `SELECT id, name, email, password
         FROM users
         WHERE email = $1`,
        [cleanEmail]
      );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error:
          "Email या Password गलत है।"
      });
    }

    const user = result.rows[0];

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatch) {
      return res.status(401).json({
        error:
          "Email या Password गलत है।"
      });
    }

    res.json({
      success: true,
      message:
        "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );

    res.status(500).json({
      error:
        "Login में समस्या हुई।"
    });
  }
});

/* =========================
   ADMIN LOGIN
========================= */

app.post("/api/admin/login", (req, res) => {
  try {

    const { email, password } = req.body;

    const adminEmail =
      process.env.ADMIN_EMAIL;

    const adminPassword =
      process.env.ADMIN_PASSWORD;

    if (!SESSION_SECRET) {
      return res.status(500).json({
        error:
          "SESSION_SECRET Render में सेट नहीं है।"
      });
    }

    if (!adminEmail || !adminPassword) {
      return res.status(500).json({
        error:
          "ADMIN_EMAIL या ADMIN_PASSWORD Render में सेट नहीं है।"
      });
    }

    if (
      !email ||
      !password ||
      email.trim().toLowerCase() !==
        adminEmail.trim().toLowerCase() ||
      password !== adminPassword
    ) {
      return res.status(401).json({
        error:
          "Admin Email या Password गलत है।"
      });
    }

    const token =
      createAdminToken();

    const secure =
      process.env.NODE_ENV === "production"
        ? "; Secure"
        : "";

    res.setHeader(
      "Set-Cookie",
      `admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secure}`
    );

    res.json({
      success: true,
      message:
        "Admin login successful"
    });

  } catch (error) {

    console.error(
      "ADMIN LOGIN ERROR:",
      error
    );

    res.status(500).json({
      error:
        "Admin login में समस्या हुई।"
    });
  }
});

/* =========================
   ADMIN CHECK
========================= */

app.get(
  "/api/admin/check",
  requireAdmin,
  (req, res) => {

    res.json({
      success: true,
      admin: true
    });

  }
);

/* =========================
   ADMIN USERS LIST
========================= */

app.get(
  "/api/admin/users",
  requireAdmin,
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `SELECT
             id,
             name,
             email,
             created_at
           FROM users
           ORDER BY created_at DESC`
        );

      res.json({
        success: true,
        users: result.rows
      });

    } catch (error) {

      console.error(
        "ADMIN USERS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Users की जानकारी प्राप्त नहीं हो सकी।"
      });
    }
  }
);

/* =========================
   ADMIN LOGOUT
========================= */

app.post(
  "/api/admin/logout",
  (req, res) => {

    res.setHeader(
      "Set-Cookie",
      "admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
    );

    res.json({
      success: true,
      message:
        "Admin logout successful"
    });

  }
);

/* =========================
   GEMINI CHAT
========================= */

app.post("/api/chat", async (req, res) => {
  try {

    const message =
      req.body?.message;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error:
          "Message खाली है"
      });
    }

    const apiKey =
      process.env.GEMINI_API_KEY;

    if (!apiKey) {

      console.error(
        "GEMINI_API_KEY missing"
      );

      return res.status(500).json({
        error:
          "GEMINI_API_KEY Render Environment में सेट नहीं है।"
      });
    }

    console.log(
      "User:",
      message
    );

    const ai =
      new GoogleGenAI({
        apiKey: apiKey
      });

    const response =
      await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: message
      });

    const reply =
      response.text;

    console.log(
      "Gemini response received"
    );

    return res.json({
      reply:
        reply ||
        "मुझे जवाब नहीं मिला।"
    });

  } catch (error) {

    console.error(
      "========== GEMINI ERROR =========="
    );

    console.error(error);

    console.error(
      "==================================="
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Gemini API में समस्या हुई।"
    });
  }
});

/* =========================
   START SERVER
========================= */

async function startServer() {

  await createUsersTable();

  app.listen(
    PORT,
    "0.0.0.0",
    () => {

      console.log(
        `BaatAI running on port ${PORT}`
      );

    }
  );
}

startServer();
