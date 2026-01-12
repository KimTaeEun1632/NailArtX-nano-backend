require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mime = require("mime");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(express.json({ limit: "5mb" }));

function getAllowedOrigins() {
  return ["http://localhost:5173", "https://nail-art-x.vercel.app"];
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (getAllowedOrigins().includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.options("*", cors());

console.log("🔥 GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);

// Gemini SDK
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  authMode: "API_KEY",
});

// /generate API
app.post("/generate", async (req, res) => {
  try {
    const prompt = req.body.keyword?.trim();

    const model = "gemini-3-pro-image-preview";

    const config = {
      responseModalities: ["IMAGE", "TEXT"],
      imageConfig: { imageSize: "1K" },
    };

    const contents = [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ];

    // STREAMING 요청
    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
    });

    console.log("🔄 Streaming image generation...");

    let imageBuffer = null;
    let mimeType = null;

    for await (const chunk of response) {
      const part = chunk?.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData) {
        const base64data = part.inlineData.data;
        mimeType = part.inlineData.mimeType || "image/png";
        imageBuffer = Buffer.from(base64data, "base64");
      }
    }

    if (!imageBuffer) {
      return res.status(500).json({ error: "No image data received" });
    }

    res.setHeader("Content-Type", mimeType);
    res.send(imageBuffer);
  } catch (err) {
    console.error("❌ GenAI error:", err);
    res.status(500).json({ error: "Generation failed", detail: err.message });
  }
});

// health check
app.get("/", (req, res) => {
  res.send("Nail Art Streaming API is running 🖤");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * Express 전역 에러 핸들러
 * 라우트에서 처리되지 않은 에러를 처리합니다.
 */
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    success: false,
    error: err instanceof Error ? err.message : "Unknown error",
  });
});

// Google Cloud Functions용
module.exports.helloHttp = app;

// 로컬 개발 또는 다른 환경용
module.exports.app = app;

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
