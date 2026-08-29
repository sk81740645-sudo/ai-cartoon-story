const express = require("express");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message खाली है"
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: message,
      config: {
        systemInstruction:
          "आप BaatAI हैं। हिंदी, English और Hinglish में दोस्ताना, आसान और उपयोगी जवाब दें।"
      }
    });

    res.json({
      reply: response.text
    });

  } catch (error) {
    console.error("Gemini Error:", error);

    res.status(500).json({
      error: "AI से जवाब लेने में समस्या हुई।"
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`BaatAI running on port ${PORT}`);
});
