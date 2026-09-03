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

app.use(express.json());

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
   SESSION SECRET
========================= */

const SESSION_SECRET =
  process.env.SESSION_SECRET;

/* =========================
   ADMIN TOKEN
========================= */

function createAdminToken() {
  const expires =
    Date.now() + 24 * 60 * 60 * 1000;

  const data = `admin:${expires}`;

  const signature =
    crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(data)
      .digest("hex");

  return Buffer
    .from(`${data}:${signature}`)
    .toString("base64url");
}

/* =========================
   VERIFY ADMIN TOKEN
========================= */

function verifyAdminToken(token) {
  try {
    const decoded =
      Buffer
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

    const expectedSignature =
      crypto
        .createHmac("sha256", SESSION_SECRET)
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

  } catch (error) {
    return false;
  }
}

/* =========================
   GET COOKIE
========================= */

function getCookie(req, name) {
  const cookies =
    req.headers.cookie || "";

  const parts = cookies.split(";");

  for (const part of parts) {
    const [key, ...value] =
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
   REQUIRE ADMIN
========================= */

function requireAdmin(req, res, next) {
  const token =
    getCookie(req, "admin_session");

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
   CREATE DATABASE TABLES
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
        user_id INTEGER NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'New Chat',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    /* MESSAGES */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER NOT NULL
          REFERENCES chats(id)
          ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log(
      "Users, chats and messages tables ready"
    );

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
   ROBOTS.TXT
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
   HEALTH CHECK
========================= */

app.get(
  "/api/health",
  async (req, res) => {
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
          error: "User ID जरूरी है।"
        });
      }

      const result =
        await pool.query(
          `INSERT INTO chats
           (user_id, title)
           VALUES ($1, $2)
           RETURNING id, title, created_at, updated_at`,
          [
            userId,
            title || "New Chat"
          ]
        );

      res.json({
        success: true,
        chat: result.rows[0]
      });

    } catch (error) {

      console.error(
        "CREATE CHAT ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Chat बनाने में समस्या हुई।"
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
        Number(req.params.userId);

      if (!userId) {
        return res.status(400).json({
          error: "Invalid user ID"
        });
      }

      const result =
        await pool.query(
          `SELECT
             id,
             title,
             created_at,
             updated_at
           FROM chats
           WHERE user_id = $1
           ORDER BY updated_at DESC`,
          [userId]
        );

      res.json({
        success: true,
        chats: result.rows
      });

    } catch (error) {

      console.error(
        "GET CHATS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Previous chats प्राप्त नहीं हो सकीं।"
      });
    }
  }
);

/* =========================
   GET CHAT MESSAGES
========================= */

app.get(
  "/api/chats/:chatId/messages",
  async (req, res) => {

    try {

      const chatId =
        Number(req.params.chatId);

      const userId =
        Number(req.query.userId);

      if (!chatId || !userId) {
        return res.status(400).json({
          error: "Invalid chat information"
        });
      }

      /* CHECK CHAT BELONGS TO USER */

      const chatCheck =
        await pool.query(
          `SELECT id
           FROM chats
           WHERE id = $1
           AND user_id = $2`,
          [chatId, userId]
        );

      if (chatCheck.rows.length === 0) {
        return res.status(403).json({
          error:
            "यह chat आपके account की नहीं है।"
        });
      }

      const result =
        await pool.query(
          `SELECT
             id,
             role,
             content,
             created_at
           FROM messages
           WHERE chat_id = $1
           ORDER BY created_at ASC`,
          [chatId]
        );

      res.json({
        success: true,
        messages: result.rows
      });

    } catch (error) {

      console.error(
        "GET MESSAGES ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Messages प्राप्त नहीं हो सके।"
      });
    }
  }
);

/* =========================
   DELETE CHAT
========================= */

app.delete(
  "/api/chats/:chatId",
  async (req, res) => {

    try {

      const chatId =
        Number(req.params.chatId);

      const userId =
        Number(req.query.userId);

      if (!chatId || !userId) {
        return res.status(400).json({
          error: "Invalid information"
        });
      }

      const result =
        await pool.query(
          `DELETE FROM chats
           WHERE id = $1
           AND user_id = $2
           RETURNING id`,
          [chatId, userId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Chat नहीं मिली।"
        });
      }

      res.json({
        success: true,
        message:
          "Chat delete हो गई।"
      });

    } catch (error) {

      console.error(
        "DELETE CHAT ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Chat delete नहीं हो सकी।"
      });
    }
  }
);

/* =========================
   SAVE MESSAGE
========================= */

async function saveMessage(
  chatId,
  role,
  content
) {

  await pool.query(
    `INSERT INTO messages
     (chat_id, role, content)
     VALUES ($1, $2, $3)`,
    [
      chatId,
      role,
      content
    ]
  );

  await pool.query(
    `UPDATE chats
     SET updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [chatId]
  );
}

/* =========================
   UPDATE CHAT TITLE
========================= */

async function updateChatTitle(
  chatId,
  title
) {

  await pool.query(
    `UPDATE chats
     SET title = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [title, chatId]
  );
}

/* =========================
   GEMINI CHAT
========================= */

app.post(
  "/api/chat",
  async (req, res) => {

    try {

      const {
        message,
        userId,
        chatId
      } = req.body;

      if (
        !message ||
        !message.trim()
      ) {
        return res.status(400).json({
          error:
            "Message खाली है"
        });
      }

      if (!userId) {
        return res.status(400).json({
          error:
            "User ID जरूरी है।"
        });
      }

      let currentChatId =
        Number(chatId);

      /* =========================
         CREATE CHAT IF NEEDED
      ========================= */

      if (!currentChatId) {

        const chatResult =
          await pool.query(
            `INSERT INTO chats
             (user_id, title)
             VALUES ($1, $2)
             RETURNING id`,
            [
              userId,
              message.trim().substring(0, 50)
            ]
          );

        currentChatId =
          chatResult.rows[0].id;

      } else {

        /* CHECK CHAT OWNER */

        const ownerCheck =
          await pool.query(
            `SELECT id
             FROM chats
             WHERE id = $1
             AND user_id = $2`,
            [
              currentChatId,
              userId
            ]
          );

        if (ownerCheck.rows.length === 0) {
          return res.status(403).json({
            error:
              "यह chat आपके account की नहीं है।"
          });
        }
      }

      /* =========================
         API KEY
      ========================= */

      const apiKey =
        process.env.GEMINI_API_KEY;

      if (!apiKey) {

        return res.status(500).json({
          error:
            "GEMINI_API_KEY Render Environment में सेट नहीं है।"
        });
      }

      /* =========================
         SAVE USER MESSAGE
      ========================= */

      await saveMessage(
        currentChatId,
        "user",
        message.trim()
      );

      /* =========================
         GET CHAT HISTORY
      ========================= */

      const historyResult =
        await pool.query(
          `SELECT
             role,
             content
           FROM messages
           WHERE chat_id = $1
           ORDER BY created_at ASC`,
          [currentChatId]
        );

      /* =========================
         GEMINI
      ========================= */

      const ai =
        new GoogleGenAI({
          apiKey
        });

      const contents =
        historyResult.rows.map(
          (item) => ({
            role:
              item.role === "user"
                ? "user"
                : "model",

            parts: [
              {
                text: item.content
              }
            ]
          })
        );

      const response =
        await ai.models.generateContent({

          model:
            "gemini-3.6-flash",

          contents

        });

      const reply =
        response.text ||
        "मुझे जवाब नहीं मिला।";

      /* =========================
         SAVE AI MESSAGE
      ========================= */

      await saveMessage(
        currentChatId,
        "model",
        reply
      );

      /* =========================
         CHAT TITLE
      ========================= */

      const messageCount =
        historyResult.rows.length;

      if (messageCount <= 1) {

        await updateChatTitle(
          currentChatId,
          message
            .trim()
            .substring(0, 50)
        );
      }

      console.log(
        "Gemini response saved"
      );

      res.json({
        success: true,
        chatId: currentChatId,
        reply
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

      if (newPassword.length < 6) {
        return res.status(400).json({
          error:
            "Password कम से कम 6 अक्षर का होना चाहिए।"
        });
      }

      const hashedPassword =
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
            hashedPassword,
            userId
          ]
        );

      if (result.rows.length === 0) {
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
