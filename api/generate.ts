import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { aiDisabled } from '../lib/server/aiPolicy.js';
import { requireAIUser } from '../lib/server/aiAuth.js';

import { SYSTEM_INSTRUCTION } from '../lib/examRules.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (aiDisabled(process.env)) return res.status(503).json({ error: 'AI generation is disabled on this preview. Use private practice to import a reviewed exam.' });
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await requireAIUser(req,res))) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: API key not configured.' });
  }

  try {
    const { prompt, difficulty } = req.body;

    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 900000) {
      return res.status(400).json({ error: 'Provide a prompt of 1–900,000 characters; select fewer sections if necessary.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const thinkingLevel = difficulty === 'expert'
      ? ThinkingLevel.HIGH
      : difficulty === 'hard'
        ? ThinkingLevel.MEDIUM
        : ThinkingLevel.LOW;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_QUESTION_MODEL?.trim() || 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel },
        maxOutputTokens: 32768,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            exam: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER },
                  vignette: { type: Type.STRING },
                  leadIn: { type: Type.STRING },
                  options: {
                    type: Type.OBJECT,
                    properties: {
                      A: { type: Type.STRING },
                      B: { type: Type.STRING },
                      C: { type: Type.STRING },
                      D: { type: Type.STRING },
                    },
                    required: ["A", "B", "C", "D"],
                  },
                  correctAnswer: { type: Type.STRING, enum: ["A", "B", "C", "D"] },
                  explanation: { type: Type.STRING },
                  metadata: {
                    type: Type.OBJECT,
                    properties: {
                      losTested: { type: Type.ARRAY, items: { type: Type.STRING } },
                      cluster: { type: Type.STRING },
                      cognitiveLevel: { type: Type.STRING },
                      subtype: { type: Type.STRING },
                      week: { type: Type.INTEGER },
                      sourceDocument: { type: Type.STRING },
                      isMaintenance: { type: Type.BOOLEAN },
                      objectiveIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                      topicId: { type: Type.STRING },
                      bucketId: { type: Type.STRING },
                      itemId: { type: Type.STRING },
                      caseId: { type: Type.STRING },
                      sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                        title: { type: Type.STRING }, page: { type: Type.INTEGER },
                        url: { type: Type.STRING }, accessed: { type: Type.STRING },
                      }, required: ['title'] } },
                    },
                    required: ["losTested", "cluster", "cognitiveLevel", "subtype", "week", "sourceDocument"],
                  },
                },
                required: ["id", "vignette", "leadIn", "options", "correctAnswer", "explanation", "metadata"],
              },
            },
          },
        },
      },
    });

    if (response.text) {
      let cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanText);
      if (parsed.exam && Array.isArray(parsed.exam)) {
        return res.status(200).json({ exam: parsed.exam });
      }
    }

    return res.status(500).json({ error: 'Invalid response format from AI.' });
  } catch (error: any) {
    console.error('Generate API Error:', error);

    const msg = error?.message || String(error);

    if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
      return res.status(403).json({ error: 'API access denied. The server API key may be invalid.' });
    }
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment and try again.' });
    }
    if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
      return res.status(503).json({ error: 'The AI model is temporarily overloaded. Please try again shortly.' });
    }

    return res.status(500).json({ error: 'Failed to generate exam. Please try again.' });
  }
}
