import { GoogleGenAI } from "@google/genai";

// Explicitly tell Vercel to use its built-in JSON body parser.
// The default is true, but being explicit prevents runtime-version surprises.
export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // --- Guard 1: Fail loudly if the env var is missing ---
    // eslint-disable-next-line no-undef
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("FATAL: GEMINI_API_KEY environment variable is not set.");
      return res.status(500).json({ error: "Server misconfiguration: API key absent." });
    }

    // --- Guard 2: Defensive body parsing ---
    // Vercel auto-parses application/json, but defensively handle the case
    // where the body arrives as a raw string (e.g., missing Content-Type header).
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Request body is not valid JSON." });
      }
    }

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Request body is missing or not an object." });
    }

    const { prompt } = body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "'prompt' field is required and must be a string." });
    }

    // --- Core logic ---
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    // response.text is a getter in @google/genai — guard against empty responses
    const text = response.text;
    if (!text) {
      return res.status(500).json({ error: "Gemini returned an empty response (possible safety filter)." });
    }

    return res.status(200).json({ text });

  } catch (error) {
    // Log the full stack on the server so you can see it in Vercel's function logs
    console.error("Handler caught error:", error.message);
    console.error(error.stack);
    return res.status(500).json({ error: error.message });
  }
}