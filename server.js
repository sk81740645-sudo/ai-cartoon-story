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
  const message = req.body.message;

  if (!message || !message.trim()) {
    return res.status(400).json({
      error: "Message खाली है"
    });
  }

  // AI को अधिकतम 3 बार कोशिश करने देंगे
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: message,
        config: {
          systemInstruction:
            "आप BaatAI हैं। हिंदी में दोस्ताना, आसान और उपयोगी जवाब दें। जरूरत होने पर English और Hinglish में भी जवाब दें।"
        }
      });

      return res.json({
        reply: response.text
      });

    } catch (error) {
      console.error(`Gemini attempt ${attempt} failed:`, error.message);

      // आखिरी कोशिश भी fail हो गई
      if (attempt === 3) {
        return res.status(500).json({
          error: "AI से जवाब लेने में समस्या हुई। कृपया थोड़ी देर बाद फिर कोशिश करें।"
        });
      }

      // अगली कोशिश से पहले थोड़ा इंतजार
      await new Promise(resolve =>
        setTimeout(resolve, attempt * 2000)
      );
    }
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`BaatAI running on port ${PORT}`);
});
