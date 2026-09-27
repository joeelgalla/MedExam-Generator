import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { aiDisabled } from '../lib/server/aiPolicy.js';
import { requireAIUser } from '../lib/server/aiAuth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (aiDisabled(process.env)) return res.status(503).json({ error: 'AI source analysis is disabled on this preview.' });
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
    const { question, files } = req.body;

    if (!question || !files) {
      return res.status(400).json({ error: 'Missing question or files in request body.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    let fileContext = '';
    files.forEach((f: any, index: number) => {
      fileContext += `\n--- FILE START (ID: ${index}): ${f.name} ---\n${(f.content || '')}\n--- FILE END ---\n`;
    });

    const prompt = `SOURCE FILES:\n${fileContext}\n\nTHE QUESTION:\n"${question.vignette}"\nLead In: ${question.leadIn}\nCorrect Answer: ${question.correctAnswer}) ${question.options[question.correctAnswer]}\n\nOUTPUT FORMAT (Markdown):\n**Source:** [File Name]\n**Evidence:** "[Direct Quote]"\n**Analysis:** [Brief explanation of how the evidence supports the answer]\n\nIf the exact answer is not found in the text, explicitly state: "Source material does not contain direct evidence for this specific fact."`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are an evidence-retrieval assistant helping a medical student verify exam answers against their lecture notes. Scan the provided source files, find the exact text segment (quote, bullet, slide content) that validates the correct answer, cite the file, and briefly explain the connection.',
      },
    });

    return res.status(200).json({ text: response.text || 'Could not generate source analysis.' });
  } catch (error) {
    console.error('Analyze API Error:', error);
    return res.status(500).json({ error: 'Unable to analyze sources. The context may be too large or the service is busy.' });
  }
}
