import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// Per-question tutor chat. Stateless: client sends full history each turn.
// The stable prefix (source files + question context) lives in systemInstruction
// so Gemini's implicit prompt caching gives ~75% off input tokens on follow-up turns.

const SYSTEM_INSTRUCTION_PREFIX = `You are a medical tutor helping a medical student understand a specific practice exam question they have already answered.

You have access to:
- The source material (lecture slides, self-learning modules, learning objectives, pre-readings) that this question was generated from.
- The full question: vignette, lead-in, options, the correct answer, the authoritative explanation, and the learning objectives being tested.
- Your conversation with the student so far.

RULES:
- Be concrete, not vague. Every sentence should teach something specific.
- Cite source material by filename when you reference a specific fact. Quote verbatim when possible. If you are reasoning from a general principle rather than a direct quote, say so plainly ("based on general principle" or "inferred from the material") — do not present inference as evidence.
- When the student asks about a specific highlighted phrase from the question stem, explain its clinical significance and how it points toward or away from the correct answer.
- If asked "why is option X wrong," work through the ruling-out logic with reference to the source material or the authoritative explanation.
- If a question is outside the scope of this question or the provided source material, say so plainly. Do not fabricate.
- Use short paragraphs and light markdown (\`**bold**\`, bullet lists starting with \`- \`) for readability.
- Keep responses under ~600 words unless the student explicitly asks for more.`;

function buildSystemInstruction(
  question: any,
  files: Array<{ name: string; content?: string }>,
): string {
  // Prioritize the model-attributed sourceDocument if present (from the Apr 16 analytics rewrite).
  const primaryName: string | undefined = question?.metadata?.sourceDocument;
  const primary = primaryName ? files.find((f) => f.name === primaryName) : undefined;
  const others = primary ? files.filter((f) => f.name !== primary.name) : files;

  let fileContext = '';
  if (primary) {
    fileContext += `\n--- PRIMARY SOURCE (model-attributed): ${primary.name} ---\n${(primary.content || '').slice(0, 300000)}\n--- END PRIMARY SOURCE ---\n`;
  }
  others.forEach((f, index) => {
    fileContext += `\n--- FILE (ID ${index}): ${f.name} ---\n${(f.content || '').slice(0, 300000)}\n--- END FILE ---\n`;
  });

  const losList: string[] = Array.isArray(question?.metadata?.losTested)
    ? question.metadata.losTested
    : [];

  return `${SYSTEM_INSTRUCTION_PREFIX}

SOURCE FILES:${fileContext}

THE QUESTION:
Vignette: "${question?.vignette ?? ''}"
Lead-in: ${question?.leadIn ?? ''}
Options:
  A) ${question?.options?.A ?? ''}
  B) ${question?.options?.B ?? ''}
  C) ${question?.options?.C ?? ''}
  D) ${question?.options?.D ?? ''}
Correct answer: ${question?.correctAnswer ?? ''}) ${question?.options?.[question?.correctAnswer] ?? ''}
Authoritative explanation: ${question?.explanation ?? ''}
Learning objectives tested: ${losList.join(' | ') || '(none provided)'}
`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: API key not configured.' });
  }

  try {
    const { question, files, history, userMessage } = req.body as {
      question: any;
      files: Array<{ name: string; content?: string }>;
      history: Array<{ role: 'user' | 'assistant'; text: string }>;
      userMessage: string;
    };

    if (!question || !Array.isArray(files) || typeof userMessage !== 'string' || !userMessage.trim()) {
      return res.status(400).json({ error: 'Missing question, files, or userMessage in request body.' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = buildSystemInstruction(question, files);

    // Gemini contents: alternating user/model turns. Frontend uses 'assistant'; SDK expects 'model'.
    const safeHistory = Array.isArray(history) ? history : [];
    const contents = [
      ...safeHistory.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    return res.status(200).json({ text: response.text || 'No reply generated.' });
  } catch (error: any) {
    console.error('Chat API Error:', error);
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

    return res.status(500).json({ error: 'Unable to generate a reply. The context may be too large or the service is busy.' });
  }
}
