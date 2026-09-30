
import { UploadedFile, ExamQuestion, DifficultyLevel, BlueprintSection, ExamAttempt, PracticeMode, ChatMessage } from '../types';
import type { Project } from '../types';
import { buildGenerationPrompt, MAX_BUILTIN_QUESTIONS } from './generationPrompt';
import { validateGeneratedQuestions } from './projectWorkflow';
import { supabase } from '../lib/supabase';
async function aiHeaders() {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) throw new Error('Sign in to use built-in AI, or download the AI packet and import the result.');
  return {'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`};
}

export async function getAIAvailability():Promise<{available:boolean;reason:string}> {
  try {
    const response=await fetch('/api/ai-status',{headers:await aiHeaders()});
    const data=await response.json();
    return {available:response.ok&&data.available===true,reason:response.ok?'':data.error||'AI availability could not be checked. Try again.'};
  } catch {return {available:false,reason:'AI availability could not be checked. Check your connection and try again.'};}
}

// --- OCR (Image Text Extraction) ---
export const extractTextFromImage = async (base64Data: string, mimeType: string): Promise<string> => {
  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: await aiHeaders(),
    body: JSON.stringify({ base64Data, mimeType, type: 'image' }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'No text identified in image.');
  }
  return data.text;
};

// --- Audio/Video Transcription ---
export const transcribeMedia = async (base64Data: string, mimeType: string): Promise<string> => {
  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: await aiHeaders(),
    body: JSON.stringify({ base64Data, mimeType, type: 'media' }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Could not transcribe media.');
  }
  return data.text;
};

// --- Deep Dive / Source Verification ---
export const getQuestionSourceAnalysis = async (
  question: ExamQuestion,
  files: UploadedFile[]
): Promise<string> => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: await aiHeaders(),
      body: JSON.stringify({ question, files }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Source analysis did not complete. Try again.');
    }
    return data.text;
  } catch (error) {
    console.error('Deep Dive Error:', error);
    throw error instanceof Error ? error : new Error('Unable to reach source analysis. Check your connection and try again.');
  }
};

// --- Per-Question Tutor Chat ---
// Stateless: caller sends full history array each turn. Backend handles the Gemini
// contents shape. Deep Dive output, if present, should be prepended as an
// assistant message by the caller so the tutor sees it as conversational context.
export const sendChatMessage = async (
  question: ExamQuestion,
  files: UploadedFile[],
  history: ChatMessage[],
  userMessage: string,
): Promise<string> => {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: await aiHeaders(),
      body: JSON.stringify({ question, files, history, userMessage }),
    });

    const data = await response.json();
    if (!response.ok) {
      return `Error: ${data.error || 'Unable to send message.'}`;
    }
    return data.text;
  } catch (error) {
    console.error('Chat Error:', error);
    return 'Error: Unable to reach the chat service.';
  }
};

// Both built-in generation and the external packet use the same project recipe.
export const generateExam = async (project: Project): Promise<ExamQuestion[]> => {
  if (project.activeExam.questionCount > MAX_BUILTIN_QUESTIONS) throw new Error('Built-in generation supports up to 20 questions per set. For a full mock, download the AI packet and import the returned exam.');
  const prompt=buildGenerationPrompt(project);
  const response=await fetch('/api/generate',{method:'POST',headers:await aiHeaders(),body:JSON.stringify({prompt,difficulty:project.activeExam.difficulty,hasObjectiveRegistry:!!project.registry})});
  const data=await response.json();
  if(!response.ok) throw Object.assign(new Error(data.error || 'Generation failed. Your existing exam is unchanged.'),{code:data.code,status:response.status});
  const questions=validateGeneratedQuestions(data.exam,project.registry);
  // Preserve a valid shorter set without an automatic billable retry. The UI
  // reports the actual count; malformed questions still reject the whole set.
  if(questions.length>project.activeExam.questionCount) throw new Error(`The AI returned more questions than requested. The set was not installed.`);
  const normalize=(q:ExamQuestion)=>`${q.vignette} ${q.leadIn}`.toLowerCase().replace(/[^a-z0-9]/g,'');
  const previous=new Set([...(project.savedExams || []).flatMap(e=>e.questions),...project.examHistory.flatMap(a=>a.questions),...(project.styleExamples || [])].map(normalize));
  const seen=new Set<string>();
  for(const q of questions){const key=normalize(q);if(previous.has(key)||seen.has(key))throw new Error('The AI repeated an existing or example question. The set was not installed; try another set.');seen.add(key);}
  return questions;
};
