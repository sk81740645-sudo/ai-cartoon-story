const express = require("express");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "BaatAI server is running"
  });
});

/* =========================
   GEMINI CHAT
========================= */

app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body?.message;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message खाली है"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY missing");

      return res.status(500).json({
        error: "GEMINI_API_KEY Render Environment में सेट नहीं है।"
      });
    }

    console.log("User:", message);

    const ai = new GoogleGenAI({
      apiKey: apiKey
    });

    const response = await ai.models.generateContent({
   model: "gemini-3.6-flash",
      contents: message
    });

    const reply = response.text;

    console.log("Gemini response received");

    return res.json({
      reply: reply || "मुझे जवाब नहीं मिला।"
    });

  } catch (error) {

    console.error("========== GEMINI ERROR ==========");
    console.error(error);
    console.error("===================================");

    return res.status(500).json({
      error: error?.message || "Gemini API में समस्या हुई।"
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BaatAI running on port ${PORT}`);
});
