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

    console.log("Question:", message);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: message,
      config: {
        systemInstruction:
          "You are BaatAI. Answer questions clearly and helpfully. Understand Hindi, English and Hinglish. Reply in the same language as the user's question."
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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`BaatAI running on port ${PORT}`);
});
