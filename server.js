const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json({ limit: "15mb" }));

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
   STATIC FILES
========================= */

app.use(express.static(__dirname));

/* =========================
   ROBOTS
========================= */

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");

  res.send(`User-agent: *
Allow: /

Sitemap: https://baatai-ai.onrender.com/sitemap.xml`);
});

/* =========================
   SITEMAP
========================= */

app.get("/sitemap.xml", (req, res) => {
  res.type("application/xml");

  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

<url>
<loc>https://baatai-ai.onrender.com/</loc>
</url>

</urlset>`);
});

/* =========================
   SESSION
========================= */

const SESSION_SECRET =
  process.env.SESSION_SECRET;

/* =========================
   ADMIN TOKEN
========================= */

function createAdminToken() {

  const expires =
    Date.now() + 24 * 60 * 60 * 1000;

  const data =
    `admin:${expires}`;

  const signature =
    crypto
      .createHmac(
        "sha256",
        SESSION_SECRET
      )
      .update(data)
      .digest("hex");

  return Buffer
    .from(
      `${data}:${signature}`
    )
    .toString("base64url");
}

/* =========================
   VERIFY ADMIN TOKEN
========================= */

function verifyAdminToken(token) {

  try {

    const decoded =
      Buffer
        .from(
          token,
          "base64url"
        )
        .toString("utf8");

    const parts =
      decoded.split(":");

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

    const data =
      `${role}:${expires}`;

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          SESSION_SECRET
        )
        .update(data)
        .digest("hex");

    if (
      signature.length !==
      expectedSignature.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

  } catch {

    return false;

  }
}

/* =========================
   COOKIE
========================= */

function getCookie(req, name) {

  const cookies =
    req.headers.cookie || "";

  const parts =
    cookies.split(";");

  for (const part of parts) {

    const [
      key,
      ...value
    ] =
      part.trim().split("=");

    if (key === name) {

      return decodeURIComponent(
        value.join("=")
      );

    }

  }

  return null;
}

/* =========================
   ADMIN MIDDLEWARE
========================= */

function requireAdmin(req, res, next) {

  const token =
    getCookie(
      req,
      "admin_session"
    );

  if (
    !token ||
    !verifyAdminToken(token)
  ) {

    return res.status(401).json({
      error: "Admin login required"
    });

  }

  next();

}

/* =========================
   DATABASE TABLES
========================= */

async function createTables() {

  try {

    /* USERS */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    /* CHATS */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT DEFAULT 'New Chat',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    /* MESSAGES */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        image_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Database tables ready");

  } catch (error) {

    console.error(
      "DATABASE TABLE ERROR:",
      error.message
    );

  }

}

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "index.html"
    )
  );

});

/* =========================
   HEALTH
========================= */

app.get(
  "/api/health",
  async (req, res) => {

    try {

      await pool.query(
        "SELECT 1"
      );

      res.json({
        status: "ok",
        database: "connected",
        message:
          "BaatAI server is running"
      });

    } catch (error) {

      res.status(500).json({
        status: "error",
        database: "not connected",
        error: error.message
      });

    }

  }
);

/* =========================
   SIGN UP
========================= */

app.post(
  "/api/signup",
  async (req, res) => {

    try {

      const {
        name,
        email,
        password
      } = req.body;

      if (
        !name ||
        !email ||
        !password
      ) {

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
        email
          .trim()
          .toLowerCase();

      const existing =
        await pool.query(
          "SELECT id FROM users WHERE email = $1",
          [cleanEmail]
        );

      if (existing.rows.length > 0) {

        return res.status(409).json({
          error:
            "इस Email से account पहले से मौजूद है।"
        });

      }

      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        );

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

  }
);

/* =========================
   LOGIN
========================= */

app.post(
  "/api/login",
  async (req, res) => {

    try {

      const {
        email,
        password
      } = req.body;

      if (
        !email ||
        !password
      ) {

        return res.status(400).json({
          error:
            "Email और Password डालें।"
        });

      }

      const cleanEmail =
        email
          .trim()
          .toLowerCase();

      const result =
        await pool.query(
          `SELECT
            id,
            name,
            email,
            password
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

      const user =
        result.rows[0];

      const match =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!match) {

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

  }
);

/* =========================
   ADMIN LOGIN
========================= */

app.post(
  "/api/admin/login",
  (req, res) => {

    try {

      const {
        email,
        password
      } = req.body;

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

      if (
        !adminEmail ||
        !adminPassword
      ) {

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
        process.env.NODE_ENV ===
        "production"
          ? "; Secure"
          : "";

      res.setHeader(
        "Set-Cookie",
        `admin_session=${encodeURIComponent(
          token
        )}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secure}`
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

  }
);

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
   ADMIN USERS
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
        users:
          result.rows
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
   ADMIN RESET PASSWORD
========================= */

app.post(
  "/api/admin/reset-password",
  requireAdmin,
  async (req, res) => {

    try {

      const {
        userId,
        newPassword
      } = req.body;

      if (
        !userId ||
        !newPassword
      ) {

        return res.status(400).json({
          error:
            "User ID और नया Password जरूरी है।"
        });

      }

      if (
        newPassword.length < 6
      ) {

        return res.status(400).json({
          error:
            "Password कम से कम 6 अक्षर का होना चाहिए।"
        });

      }

      const hashed =
        await bcrypt.hash(
          newPassword,
          10
        );

      const result =
        await pool.query(
          `UPDATE users
           SET password = $1
           WHERE id = $2
           RETURNING id, name, email`,
          [
            hashed,
            userId
          ]
        );

      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            "User नहीं मिला।"
        });

      }

      res.json({
        success: true,
        message:
          "Password successfully reset हो गया।",
        user:
          result.rows[0]
      });

    } catch (error) {

      console.error(
        "RESET PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Password reset नहीं हो पाया।"
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
   CREATE CHAT
========================= */

app.post(
  "/api/chats",
  async (req, res) => {

    try {

      const {
        userId,
        title
      } = req.body;

      if (!userId) {

        return res.status(400).json({
          error:
            "User ID जरूरी है।"
        });

      }

      const result =
        await pool.query(
          `INSERT INTO chats
           (user_id, title)
           VALUES ($1, $2)
           RETURNING *`,
          [
            userId,
            title ||
              "New Chat"
          ]
        );

      res.json({
        success: true,
        chat:
          result.rows[0]
      });

    } catch (error) {

      console.error(
        "CREATE CHAT ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Chat create नहीं हो सकी।"
      });

    }

  }
);

/* =========================
   GET PREVIOUS CHATS
========================= */

app.get(
  "/api/chats/:userId",
  async (req, res) => {

    try {

      const userId =
        req.params.userId;

      const result =
        await pool.query(
          `SELECT *
           FROM chats
           WHERE user_id = $1
           ORDER BY updated_at DESC`,
          [userId]
        );

      res.json({
        success: true,
        chats:
          result.rows
      });

    } catch (error) {

      console.error(
        "GET CHATS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Previous chats नहीं मिल सके।"
      });

    }

  }
);

/* =========================
   GET CHAT MESSAGES
========================= */

app.get(
  "/api/chats/:userId/:chatId",
  async (req, res) => {

    try {

      const {
        userId,
        chatId
      } = req.params;

      const chatResult =
        await pool.query(
          `SELECT *
           FROM chats
           WHERE id = $1
           AND user_id = $2`,
          [
            chatId,
            userId
          ]
        );

      if (
        chatResult.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            "Chat नहीं मिली।"
        });

      }

      const messages =
        await pool.query(
          `SELECT
             id,
             role,
             content,
             image_data,
             created_at
           FROM messages
           WHERE chat_id = $1
           ORDER BY created_at ASC`,
          [chatId]
        );

      res.json({

        success: true,

        chat:
          chatResult.rows[0],

        messages:
          messages.rows

      });

    } catch (error) {

      console.error(
        "GET CHAT ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Chat खोलने में समस्या हुई।"
      });

    }

  }
);

/* =========================
   SAVE MESSAGE
========================= */

app.post(
  "/api/messages",
  async (req, res) => {

    try {

      const {
        userId,
        chatId,
        role,
        content,
        imageData
      } = req.body;

      if (
        !userId ||
        !chatId ||
        !role
      ) {

        return res.status(400).json({
          error:
            "Message information अधूरी है।"
        });

      }

      const result =
        await pool.query(
          `INSERT INTO messages
           (
             chat_id,
             user_id,
             role,
             content,
             image_data
           )
           VALUES ($1,$2,$3,$4,$5)
           RETURNING *`,
          [
            chatId,
            userId,
            role,
            content || "",
            imageData || null
          ]
        );

      await pool.query(
        `UPDATE chats
         SET updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [chatId]
      );

      res.json({
        success: true,
        message:
          result.rows[0]
      });

    } catch (error) {

      console.error(
        "SAVE MESSAGE ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Message save नहीं हो पाया।"
      });

    }

  }
);

/* =========================
   GEMINI CHAT
   TEXT + IMAGE
========================= */

app.post(
  "/api/chat",
  async (req, res) => {

    try {

      const message =
        req.body?.message;

      const image =
        req.body?.image;

      if (
        !message ||
        !message.trim()
      ) {

        return res.status(400).json({
          error:
            "Message खाली है।"
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

      const ai =
        new GoogleGenAI({
          apiKey
        });

      let contents;

      /* =========================
         TEXT ONLY
      ========================= */

      if (!image) {

        contents = message;

      }

      /* =========================
         IMAGE + TEXT
      ========================= */

      else {

        /*
          Expected image format:

          data:image/jpeg;base64,AAAA...

        */

        const match =
          image.match(
            /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
          );

        if (!match) {

          return res.status(400).json({
            error:
              "Image format सही नहीं है।"
          });

        }

        const mimeType =
          match[1];

        const base64Data =
          match[2];

        contents = [

          {
            text:
              message
          },

          {
            inlineData: {
              mimeType,
              data:
                base64Data
            }
          }

        ];

      }

      console.log(
        "Gemini request received",
        image
          ? "(with image)"
          : "(text only)"
      );

      const response =
        await ai.models.generateContent({

          model:
            "gemini-3.6-flash",

          contents

        });

      const reply =
        response.text;

      console.log(
        "Gemini response received"
      );

      res.json({

        success: true,

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

      res.status(500).json({

        error:
          error?.message ||
          "Gemini API में समस्या हुई।"

      });

    }

  }
);

/* =========================
   START SERVER
========================= */

async function startServer() {

  try {

    await createTables();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `BaatAI running on port ${PORT}`
        );

      }
    );

  } catch (error) {

    console.error(
      "SERVER START ERROR:",
      error
    );

    process.exit(1);

  }

}

startServer();
