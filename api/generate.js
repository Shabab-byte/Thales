// api/generate.js
import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // 1. Ensure it's a POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Access the hidden key securely on the server side
    // eslint-disable-next-line no-undef
    const apiKey = process.env.GEMINI_API_KEY; 
    const ai = new GoogleGenAI({ apiKey });

    const { prompt } = req.body;

    // 3. Make the call to Gemini from the server
    const response = await ai.models.generateContent({
      model: "gemini 3 flash",
      contents: prompt,
    });

    // 4. Send the text back to your React app
    return res.status(200).json({ text: response.text });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}