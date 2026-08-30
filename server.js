const express = require("express");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 3000;

// JSON data पढ़ने के लिए
app.use(express.json());

// CORS - frontend को backend से connect करने के लिए
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

// Chat API
app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message खाली है"
      });
    }

    console.log("Question:", message);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: message,
      config: {
        systemInstruction:
          "You are BaatAI, a friendly AI assistant. Answer questions clearly and helpfully. Understand Hindi, Hinglish and English. Reply in the same language as the user."
      }
    });

    const reply = response.text;

    console.log("AI response received");

    res.json({
      reply: reply || "मुझे जवाब नहीं मिल पाया।"
    });

  } catch (error) {
    console.error("Gemini Error:", error);

    res.status(500).json({
      error: "AI से जवाब लेने में समस्या हुई। कृपया दोबारा कोशिश करें।"
    });
  }
});

// Frontend files
app.use(express.static(__dirname));

// Any other route -> index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`BaatAI running on port ${PORT}`);
});
