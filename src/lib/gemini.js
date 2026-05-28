// const Gemini_API_Key = import.meta.env.GEMINI_API_KEY

export async function callGemini(prompt) {
  //const curl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${Gemini_API_Key}`
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ prompt: prompt }), //  {contents : [{parts:[{text:prompt}]}]}
  });
 
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch from Gemini');
  }

  const data = await response.json();
  return data.text; // data.candidates[0].content.parts[0].text
}