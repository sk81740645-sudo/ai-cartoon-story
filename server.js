const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

let ai = null;

async function getAI() {
  if (!ai) {
    const { GoogleGenAI } = await import("@google/genai");

    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
  }

  return ai;
}

app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message खाली है"
      });
    }

    console.log("User:", message);

    const googleAI = await getAI();

    const response = await googleAI.models.generateContent({
      model: "gemini-3.7-flash",
      contents: message,
      config: {
        systemInstruction:
          "आप BaatAI हैं। दोस्ताना और आसान भाषा में जवाब दें। हिंदी, English और Hinglish तीनों में सवाल समझें और उसी भाषा में जवाब दें। जवाब स्पष्ट और उपयोगी रखें।"
      }
    });

    const reply = response.text;

    console.log("AI replied successfully");

    return res.json({
      reply: reply || "मुझे अभी जवाब नहीं मिल पाया।"
    });

  } catch (error) {

    console.error("Gemini Error:", error);

    return res.status(500).json({
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
