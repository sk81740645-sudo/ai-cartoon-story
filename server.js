const express = require("express");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

// JSON requests
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Gemini API
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "BaatAI server is running"
  });
});

// Chat API
app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body?.message;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message खाली है"
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY नहीं मिली"
      });
    }

    console.log("User:", message);

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: message,
      config: {
        systemInstruction:
          "You are BaatAI, a friendly AI assistant. Understand Hindi, Hinglish and English. Reply in the same language as the user. Give clear, simple and helpful answers."
      }
    });

    const reply = response.text;

    console.log("Gemini reply received");

    return res.json({
      reply: reply || "मुझे कोई जवाब नहीं मिला।"
    });

  } catch (error) {

    console.error("===== GEMINI ERROR =====");
    console.error(error);
    console.error("========================");

    return res.status(500).json({
      error: error?.message || "Gemini API error"
    });
  }
});

// Static files
app.use(express.static(__dirname));

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`BaatAI running on port ${PORT}`);
});
