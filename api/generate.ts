import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { MAX_CONTEXT_CHARS } from '../lib/requestLimits.js';
import { aiDisabled } from '../lib/server/aiPolicy.js';
import { requireAIUser } from '../lib/server/aiAuth.js';
import { generationError } from '../lib/server/generationError.js';

import { SYSTEM_INSTRUCTION } from '../lib/examRules.js';
import {verifyDraft} from '../lib/server/generationVerifier.js';
import {validateGeneratedQuestions} from '../services/projectWorkflow.js';

// Older open tabs send the complete source-marked prompt rather than a files array.
export function promptSources(prompt:string) {
  return [...prompt.matchAll(/--- (?:FILE(?: \([^\n]+\))?: ([^\n]+)|START OF LEARNING OBJECTIVE FILE: ([^\n]+)) ---\n([\s\S]*?)\n--- END (?:FILE|OF LEARNING OBJECTIVE FILE) ---/g)]
    .map(m=>({name:m[1]||m[2],content:m[3]}));
}

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

  const startedAt=Date.now();
  try {
    const { prompt, difficulty, hasObjectiveRegistry, objectiveWordings } = req.body;
    const examReferences=req.body.examReferences||[];
    if(!Array.isArray(examReferences)||examReferences.length>200||examReferences.some((f:any)=>typeof f?.name!=='string'||typeof f?.content!=='string')||JSON.stringify(examReferences).length>MAX_CONTEXT_CHARS)return res.status(400).json({error:'Invalid exam reference files.'});

    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_CONTEXT_CHARS) {
      return res.status(400).json({ error: `Provide a prompt of 1–${MAX_CONTEXT_CHARS.toLocaleString('en-US')} characters; select fewer sections if necessary.` });
    }
    const files=req.body.files??promptSources(prompt);
    const count=req.body.questionCount??Number(prompt.match(/Generate exactly (\d+) original questions/)?.[1]||20);
    if(!Number.isInteger(count)||count<1||count>20)return res.status(400).json({error:'Choose between 1 and 20 questions per set.'});
    if(!Array.isArray(files)||!files.length||files.length>100||files.some(f=>typeof f?.name!=='string'||typeof f?.content!=='string')||files.reduce((n,f)=>n+f.content.length,0)>MAX_CONTEXT_CHARS)return res.status(400).json({error:'Provide the selected study files for question checking. Select fewer sections if necessary; no material is silently cut.'});

    const ai = new GoogleGenAI({ apiKey });

    const thinkingLevel = difficulty === 'expert'
      ? ThinkingLevel.HIGH
      : difficulty === 'hard'
        ? ThinkingLevel.MEDIUM
        : ThinkingLevel.LOW;

    const model = process.env.GEMINI_QUESTION_MODEL?.trim() || 'gemini-3.1-pro-preview';
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        httpOptions:{timeout:170000},
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
                      cognitiveLevel: { type: Type.STRING,enum:['1.1','1.2','1.3'] },
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
                        title: { type: Type.STRING }, page: { type: Type.INTEGER }, quote: { type: Type.STRING },
                      }, required: ['title', 'quote'] } },
                      coverageNote: { type: Type.STRING },
                      rechecksItemId: { type: Type.STRING },
                    },
                    required: ["losTested", "cluster", "cognitiveLevel", "subtype", "week", "sourceDocument", "sources", "coverageNote",
                      ...(hasObjectiveRegistry === true ? ['objectiveIds', 'topicId', 'bucketId'] : [])],
                  },
                },
                required: ["id", "vignette", "leadIn", "options", "correctAnswer", "explanation", "metadata"],
              },
            },
          },
          required: ['exam'],
        },
      },
    });

    // Counts only: keep course content, answers and account identity out of logs.
    console.info('Exam generation usage', JSON.stringify({
      model,
      promptTokens: response.usageMetadata?.promptTokenCount,
      cachedTokens: response.usageMetadata?.cachedContentTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
      thinkingTokens: response.usageMetadata?.thoughtsTokenCount,
      totalTokens: response.usageMetadata?.totalTokenCount,
    }));

    if(response.candidates?.[0]?.finishReason==='MAX_TOKENS')return res.status(502).json({error:'The draft exceeded its output limit. No incomplete exam was saved and no automatic retry was made. Try a smaller set.',code:'output_limit'});
    if (response.text) {
      let cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanText);
      if (parsed.exam && Array.isArray(parsed.exam)) {
        if(!parsed.exam.length||parsed.exam.length>count)return res.status(502).json({error:'The draft did not match the requested size. Your existing exams are unchanged.',code:'invalid_draft'});
        const draft=validateGeneratedQuestions(parsed.exam);
        const result=await verifyDraft(ai,model,draft,files,difficulty,objectiveWordings,req.body.recheckTasks,req.body.requiredRechecks,startedAt+290000,examReferences);
        if(!result.exam.length)return res.status(502).json({error:'No draft questions passed source and answer checking. Your existing exams are unchanged. Select more relevant material or a smaller set.',code:'quality_check'});
        return res.status(200).json({exam:result.exam,qualityReport:{draft:parsed.exam.length,retained:result.exam.length,excluded:result.excluded}});
      }
    }

    return res.status(500).json({ error: 'Invalid response format from AI.' });
  } catch (error: any) {
    console.error('Generate API Error:', error);

    const failure=generationError(error?.message || String(error));
    return res.status(failure.status).json({error:failure.error,code:failure.code});
  }
}
