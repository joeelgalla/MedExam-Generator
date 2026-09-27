import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { aiDisabled } from '../lib/server/aiPolicy.js';
import { requireAIUser } from '../lib/server/aiAuth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (aiDisabled(process.env)) return res.status(503).json({ error: 'AI extraction is disabled on this preview.' });
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await requireAIUser(req,res))) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: API key not configured.' });
  }

  try {
    if (JSON.stringify(req.body).length > 2000000) return res.status(413).json({error:'Selected material is too large. Choose fewer source files; no text was cut.'});
    const { base64Data, mimeType, type } = req.body;

    if (!base64Data || !mimeType) {
      return res.status(400).json({ error: 'Missing base64Data or mimeType in request body.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const textPrompt = type === 'media'
      ? "Transcribe the spoken audio from this file verbatim. Do not summarize, just output the full transcript text. If there is no speech, state '[No speech detected]'."
      : "Transcribe all legible text from this image exactly as it appears. Do not summarize, just output the text content.";

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: textPrompt }
          ]
        }
      ]
    });

    if (!response.text) {
      return res.status(400).json({
        error: type === 'media' ? 'Could not transcribe media.' : 'No text identified in image.'
      });
    }

    return res.status(200).json({ text: response.text });
  } catch (error) {
    console.error('OCR API Error:', error);
    return res.status(500).json({ error: 'Failed to process file.' });
  }
}
