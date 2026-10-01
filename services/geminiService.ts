
import { UploadedFile, ExamQuestion, DifficultyLevel, BlueprintSection, ExamAttempt, PracticeMode, ChatMessage } from '../types';
import type { Project } from '../types';
import { buildGenerationPrompt, generationSources, generationExamples, MAX_BUILTIN_QUESTIONS } from './generationPrompt';
import { validateGeneratedQuestions } from './projectWorkflow';
import { verifyGenerationEvidence, verifyGeneratedSet } from './generationEvidence';
import {generationObjectivePlan,plannedRechecks,studyItemKey} from './objectiveCoverage';
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
export const generateExam = async (project: Project): Promise<{questions:ExamQuestion[];excluded:number;missingObjectives:string[];checkUnavailable:number}> => {
  if (project.activeExam.questionCount > MAX_BUILTIN_QUESTIONS) throw new Error('Built-in generation supports up to 20 questions per set. For a full mock, download the AI packet and import the returned exam.');
  const prompt=buildGenerationPrompt(project);
  const plan=generationObjectivePlan(project,project.activeExam.selectedSectionIds||project.blueprint.map(s=>s.id),project.activeExam.questionCount);
  const recheckTasks=Object.fromEntries(plannedRechecks(project,plan).map(q=>[studyItemKey(q),{task:q.metadata.coverageNote||q.leadIn,vignette:q.vignette,leadIn:q.leadIn}]));
  const response=await fetch('/api/generate',{method:'POST',headers:await aiHeaders(),body:JSON.stringify({prompt,difficulty:project.activeExam.difficulty,questionCount:project.activeExam.questionCount,files:generationSources(project),examReferences:generationExamples(project,plan),objectiveWordings:Object.fromEntries(Object.entries(project.registry?.objectives||{}).map(([id,o])=>[id,o.text||id])),recheckTasks,requiredRechecks:Object.fromEntries(plannedRechecks(project,plan).map(q=>[q.metadata.objectiveIds![0],studyItemKey(q)])),hasObjectiveRegistry:!!project.registry})});
  const data=await response.json();
  if(!response.ok) throw Object.assign(new Error(data.error || 'Generation failed. Your existing exam is unchanged.'),{code:data.code,status:response.status});
  const checkedQuestions=validateGeneratedQuestions(data.exam,project.registry);
  verifyGenerationEvidence(checkedQuestions,generationSources(project));
  const report=data.qualityReport;
  if(!report || report.retained!==checkedQuestions.length || !Array.isArray(report.excluded))throw new Error('Question checking did not return a complete report. The set was not saved.');
  const {questions}=verifyGeneratedSet(checkedQuestions,project,true);
  return {questions,excluded:project.activeExam.questionCount-questions.length,missingObjectives:plan.filter(id=>!questions.some(q=>q.metadata.objectiveIds?.[0]===id)),checkUnavailable:report.excluded.filter((x:{checkUnavailable?:boolean})=>x.checkUnavailable).length};
};
