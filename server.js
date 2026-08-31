const express = require("express");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Frontend files
app.use(express.static(__dirname));

// Gemini AI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Test route
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "BaatAI server is running"
  });
});

// AI Chat API
app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body.message;

    // Check message
    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message खाली है"
      });
    }

    // Check API key
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY सेट नहीं है"
      });
    }

    console.log("Question:", message);

    // Gemini request
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: message,
      config: {
        systemInstruction:
          "You are BaatAI, a friendly AI assistant. Answer questions clearly and helpfully. Reply in Hindi when the user speaks Hindi. You can understand Hindi, Hinglish and English. Keep answers simple and useful."
      }
    });

    const reply = response.text;

    console.log("AI response received");

    return res.json({
      reply: reply || "मुझे जवाब नहीं मिल पाया।"
    });

    } catch (error) {
    console.error("Gemini Error:", error);

    return res.status(500).json({
      error: error.message || "Gemini API में error आया है"
    });
  }

// IMPORTANT:
// यह route '*' या '/*splat' इस्तेमाल नहीं करता,
// इसलिए PathError नहीं आएगा.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`BaatAI running on port ${PORT}`);
});
