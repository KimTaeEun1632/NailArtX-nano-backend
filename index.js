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

// Nail Art Prompt
const PROMPT_TEMPLATES = {
  beginner: `
A realistic, high-resolution close-up macro shot of five artificial nails, suitable for beginner or self nail art. The nail designs are based on the theme: [KEYWORD]. The set may include repeated or similar designs across multiple nails, allowing simple pattern structures. Each nail features easy-to-recreate styles with minimal details, such as solid colors, basic glitter, simple lines, or soft gradients. The lighting is natural and soft, clearly showing the nails without dramatic effects. The background is clean and neutral to keep the focus on practical, achievable nail art. Realistic photography style.
  `.trim(),

  salon: `
A high-quality, realistic close-up macro shot of five artificial nails designed for professional salon use. The nail art is inspired by the theme: [KEYWORD]. The set can include a mix of repeated and varied designs, forming natural salon-style patterns rather than strictly unique designs. Each nail displays clean, trendy, and client-ready nail art using moderate techniques such as subtle chrome accents, glitter, ombre, or simple 3D elements. Studio lighting highlights neat finishes and glossy top coats. The background is modern and minimal, suitable for a nail salon portfolio.
  `.trim(),

  advanced: `
A hyper-realistic, high-resolution close-up macro shot of five artificial nails created by a professional nail artist. The designs are centered around the theme: [KEYWORD]. The nail set may include both repeated and varied designs, allowing artistic pattern compositions across the five nails. Each nail showcases complex, detailed, and fashionable nail art using advanced techniques such as chrome powder, layered 3D gel, glitter, and refined ombre effects. Studio-quality cinematic lighting emphasizes texture, depth, and glossy reflections. The background is a clean, modern aesthetic (such as marble or soft beige) to highlight artistic expression. Photorealistic, 8k quality.
  `.trim(),
};

// /generate API
app.post("/generate", async (req, res) => {
  try {
    const keyword = req.body.keyword || "Korean Style";
    const level = req.body.level;

    console.log("Received request:", { keyword, level }); // ← 이 로그로 확인 필수!

    if (!level || !PROMPT_TEMPLATES[level]) {
      return res.status(400).json({
        error:
          "Invalid or missing level. Must be one of: beginner, salon, advanced",
      });
    }

    const template = PROMPT_TEMPLATES[level];

    const prompt = template.replace("[KEYWORD]", keyword);

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
