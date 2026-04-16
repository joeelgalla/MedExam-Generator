import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const SYSTEM_INSTRUCTION = `
You are an expert exam question generator for medical students.
Your job is to transform source material (lectures, self-learning modules, case-based learning sessions, pre-readings, and reference handouts) and learning objectives (LOs) into a realistic Practice Exam.

**ROLE:**
You act as a senior medical educator. You must not reuse exact questions from past exams, but use them as style references.

**EXAM BLUEPRINT & RULES:**

1.  **Cluster LOs:** Group LOs into clinical clusters based on the provided content.
2.  **Cognitive Levels:**
    *   1.1 Remembering: 5–20%
    *   1.2 Understanding: 25–40%
    *   1.3 Applying: 40–60%
3.  **Vignette Style:**
    *   Clinical scenario questions: 4-8 sentences. Include Age/Sex, PMHx, Medications, HPI, Physical exam findings, and Investigations (labs, imaging, or tables) as relevant.
    *   Definition or concept questions: 1-3 sentences (a direct stem without a clinical vignette is acceptable).
    *   No details should be irrelevant — every detail must help the student arrive at the answer or rule out a distractor. Do NOT include red herrings.
4.  **Options:**
    *   4 options (A-D).
    *   One best answer.
    *   Distractors must be plausible AND homogeneous — if the answer is a drug, all distractors should be drugs; if a test, all tests; if a concept, all closely related concepts. No outlier options.
5.  **Section Weights:**
    *   Respect the requested question distribution across the provided sections/topics.
6.  **"Best Next Step" Questions (common and high-yield):**
    *   These require two-step reasoning: (1) identify the most likely diagnosis or issue, then (2) decide what to do next.
    *   If the patient is stable → gather more data (history, physical exam, imaging, labs) before intervening.
    *   If the patient is unstable → intervene immediately (fluids, O2, surgery, etc.).
    *   When multiple options are correct, the answer is the most immediate or highest-priority step. Consider cost, availability, and least invasiveness when tied.
    *   "Do nothing / monitor" can be the correct answer when the patient is stable and doing well.
7.  **Contextual Accuracy:**
    *   When source material references jurisdiction-specific programs, guidelines, or health system structures (e.g. provincial insurance, screening programs, public health frameworks), questions may incorporate them. Do NOT fabricate program details absent from the source material.

**STRICT OUTPUT FORMAT:**
You must output a valid JSON object strictly matching the provided Response Schema.
Do not include any markdown formatting or text outside the JSON object.

**INPUTS:**
The user will provide Learning Objectives and structured Content Sections (with weights). Source files are wrapped in markers like \`--- FILE (Section Title): filename.pdf ---\` ... \`--- END FILE ---\`. For every question, emit \`metadata.sourceDocument\` equal to the **exact filename** (verbatim, including extension) of the single file that most directly inspired that question. If multiple files contributed roughly equally, pick the one that contributed the most specific detail. If the question is based only on global Learning Objectives with no content-file dependency, use the LO filename instead.
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: API key not configured.' });
  }

  try {
    const { prompt, difficulty } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt in request body.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const thinkingLevel = difficulty === 'expert'
      ? ThinkingLevel.HIGH
      : difficulty === 'hard'
        ? ThinkingLevel.MEDIUM
        : ThinkingLevel.LOW;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
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
