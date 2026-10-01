import type { Project, SavedExam, ExamQuestion, ObjectiveRegistry, ActiveExamState, ExamAttempt } from '../types.ts';
import { canonical } from './projectMerge.ts';
import { parseExam, parseBackup } from './privatePractice.ts';

export const emptyExam = (): ActiveExamState => ({ questions: [], userAnswers: {}, flaggedQuestions: [], status: 'active', configOpen: true, questionCount: 10, difficulty: 'standard', durationMinutes: 30 });
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const obj = (v: any, label: string): any => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${label} must be an object.`); return v; };
const str = (v: any, label: string, max = 12000): string => { if (typeof v !== 'string' || !v.trim() || v.length > max || v.includes('\0')) throw new Error(`Invalid ${label}.`); return v; };
const ident = (v: any, label: string): string => { const s = str(v, label, 120); if (!/^[A-Za-z0-9][A-Za-z0-9_.:#-]*$/.test(s) || ['__proto__', 'constructor', 'prototype'].includes(s)) throw new Error(`Invalid ${label}.`); return s; };
const list = (v: any, label: string, max = 2000): any[] => { if (!Array.isArray(v) || v.length > max) throw new Error(`Invalid ${label}.`); return v; };
const int = (v: any, label: string, min: number, max: number): number => { if (!Number.isInteger(v) || v < min || v > max) throw new Error(`Invalid ${label}.`); return v; };
function parseSource(s: any) {
  obj(s,'Source');
  if (s.url && (!/^https:\/\//.test(s.url) || !URL.canParse(s.url))) throw new Error('Source URLs must be valid HTTPS links.');
  return { title:str(s.title,'Source title',500), ...(s.page !== undefined ? {page:int(s.page,'Source page',1,100000)}:{}), ...(s.url ? {url:str(s.url,'Source URL',2000)}:{}), ...(s.accessed ? {accessed:str(s.accessed,'Source date',40)}:{}), ...(s.quote !== undefined ? {quote:str(s.quote,'Source passage',4000)}:{}), ...(s.kind==='supplement'?{kind:'supplement' as const}:{}) };
}
// Model citations are optional hints. A malformed hint must not discard a paid
// response; question content, answer keys and objective mappings remain strict.
// User-imported files still use validateQuestions directly and fail visibly.
export function validateGeneratedQuestions(value: unknown, registry?: ObjectiveRegistry): ExamQuestion[] {
  const cases = new Map<string,string>();
  const rows = list(value,'Questions',200).map((v,i) => {
    const q = obj(v,'Question'), m = obj(q.metadata,'Question metadata');
    const metadata = {...m};
    // The app owns bank IDs. Normalize model numbering before strict validation;
    // map case labels bijectively so punctuation cannot merge distinct cases.
    delete metadata.itemId;
    delete metadata.caseId;
    if (typeof m.caseId === 'string' && m.caseId.trim()) {
      const label=m.caseId.trim();
      if (!cases.has(label)) cases.set(label,`case-${cases.size+1}`);
      metadata.caseId=cases.get(label);
    }
    if (m.sources === undefined) return {...q,id:i+1,metadata};
    const sources = (Array.isArray(m.sources) ? m.sources.slice(0,20) : []).flatMap(s => {
      try { return [parseSource(s)]; } catch { return []; }
    });
    return {...q,id:i+1,metadata:{...metadata,sources}};
  });
  return validateQuestions(rows,registry);
}
export function parseRegistry(value: unknown): ObjectiveRegistry {
  const r = obj(value, 'Registry');
  const buckets = Object.fromEntries(Object.entries(obj(r.buckets, 'Buckets')).map(([k,v]) => [ident(k,'Bucket ID'), str(v,'Bucket',250)]));
  const topics = Object.fromEntries(Object.entries(obj(r.topics, 'Topics')).map(([k,v]: [string,any]) => {
    obj(v,'Topic'); if (!own(buckets,v.bucketId)) throw new Error(`Unknown bucket ${v.bucketId}.`);
    return [ident(k,'Topic ID'), { title: str(v.title,'Topic title',250), bucketId: v.bucketId }];
  }));
  const objectives = Object.fromEntries(Object.entries(obj(r.objectives,'Objectives')).map(([k,v]: [string,any]) => {
    obj(v,'Objective'); if (!own(topics,v.topicId)) throw new Error(`Unknown topic ${v.topicId}.`);
    if(v.assessmentType!==undefined && !['knowledge','skill'].includes(v.assessmentType)) throw new Error('Invalid objective assessment type.');
    return [ident(k,'Objective ID'), { topicId: v.topicId, ...(v.text ? { text: str(v.text,'Objective text',5000) } : {}), ...(v.assessmentType ? {assessmentType:v.assessmentType as 'knowledge'|'skill'}:{}) }];
  }));
  if (!Object.keys(objectives).length || Object.keys(objectives).length > 2000) throw new Error('Registry needs 1–2000 objectives.');
  return { id: ident(r.id,'Registry ID'), buckets, topics, objectives };
}
export function validateQuestions(value: unknown, registry?: ObjectiveRegistry, allowLegacy=false): ExamQuestion[] {
  const ids = new Set<number>(), items = new Set<string>();
  const rows = list(value,'Questions',200);
  if (!rows.length) throw new Error('The exam has no questions.');
  return rows.map((v, i) => {
    const q = obj(v,`Question ${i+1}`), m = obj(q.metadata,`Question ${i+1} metadata`), o = obj(q.options,'Options');
    const id = int(q.id, 'Question ID',1,1000000);
    if (ids.has(id)) throw new Error(`Duplicate question ID ${id}.`); ids.add(id);
    if (!['A','B','C','D'].includes(q.correctAnswer)) throw new Error(`Question ${i+1} needs an A–D answer key.`);
    const options = Object.fromEntries(['A','B','C','D'].map(k => [k,str(o[k],`Question ${i+1} option ${k}`,3000)])) as ExamQuestion['options'];
    if (new Set(Object.values(options).map(x => x.trim().toLowerCase())).size !== 4) throw new Error(`Question ${i+1} has duplicate options.`);
    if (!['1.1','1.2','1.3'].includes(m.cognitiveLevel)) throw new Error(`Question ${i+1} has an invalid cognitive level.`);
    const objectiveIds = m.objectiveIds === undefined ? undefined : list(m.objectiveIds,'Objective IDs',30).map(x=>ident(x,'Objective ID'));
    const topicId = m.topicId ? ident(m.topicId,'Topic ID') : undefined, bucketId = m.bucketId ? ident(m.bucketId,'Bucket ID') : undefined;
    if (registry && !(allowLegacy && !objectiveIds?.length)) {
      if (!topicId || !bucketId || !own(registry.topics,topicId) || registry.topics[topicId].bucketId !== bucketId) throw new Error(`Question ${i+1}: topic/bucket does not match this project's registry.`);
      if (!objectiveIds?.length || objectiveIds.some(k => !own(registry.objectives,k) || registry.objectives[k].topicId !== topicId)) throw new Error(`Question ${i+1}: unknown objective ID or objective belongs to another topic.`);
    }
    const itemId = m.itemId ? ident(m.itemId,'Item ID') : undefined;
    if (itemId && items.has(itemId)) throw new Error(`Duplicate item ID ${itemId}.`); if (itemId) items.add(itemId);
    const sources = m.sources === undefined ? undefined : list(m.sources,'Sources',20).map(parseSource);
    return { id, vignette: typeof q.vignette === 'string' && !q.vignette.trim() ? '' : str(q.vignette,'Vignette'), leadIn:str(q.leadIn,'Lead-in',3000), options, correctAnswer:q.correctAnswer, explanation:str(q.explanation,'Explanation'),
      metadata: { losTested:list(m.losTested,'Learning objectives',30).map(x=>str(x,'Objective',5000)), cluster:str(m.cluster,'Cluster',250), cognitiveLevel:m.cognitiveLevel, subtype:str(m.subtype,'Subtype',80) as any, week: m.week === undefined ? 0 : int(m.week,'Week',0,1000), ...(objectiveIds ? {objectiveIds}:{}), ...(topicId ? {topicId}:{}), ...(bucketId ? {bucketId}:{}), ...(itemId ? {itemId}:{}), ...(m.caseId ? {caseId:ident(m.caseId,'Case ID')}:{}), ...(m.sourceDocument ? {sourceDocument:str(m.sourceDocument,'Source document',500)}:{}), ...(sources ? {sources}:{}), ...(m.coverageNote ? {coverageNote:str(m.coverageNote,'Objective task',2000)}:{}), ...(m.rechecksItemId ? {rechecksItemId:ident(m.rechecksItemId,'Recheck item ID')}:{}), ...(m.isMaintenance === true ? {isMaintenance:true}:{}) } };
  });
}
export function parseProjectExam(value: any, registry?: ObjectiveRegistry, allowLegacy=false): SavedExam {
  if (value?.format === 'medexam-practice') value = parseExam(value);
  const v = Array.isArray(value) ? { questions:value } : obj(value,'Exam');
  const incomingRegistry = v.registry ? parseRegistry(v.registry) : undefined;
  if (registry && incomingRegistry && incomingRegistry.id !== registry.id) throw new Error('This exam uses a different objective registry. Import it into its own project.');
  const usedRegistry = registry || incomingRegistry;
  const examId = v.examId ? ident(v.examId,'Exam ID') : crypto.randomUUID();
  const questions = validateQuestions(v.questions || v.exam,usedRegistry,allowLegacy).map((q,i)=>({...q, id:i+1, metadata:{...q.metadata,itemId:q.metadata.itemId || `${examId}-${i+1}`}}));
  return { format:'medexam-exam',version:1,examId,...(v.contentRevision===undefined?{}:{contentRevision:int(v.contentRevision,'Content revision',1,1000000)}),title:v.title ? str(v.title,'Exam title',250) : 'Imported exam',durationMinutes:v.durationMinutes === undefined ? Math.min(240,Math.max(1,Math.ceil(questions.length*1.5))) : int(v.durationMinutes,'Duration',1,240), instructions:v.instructions ? str(v.instructions,'Instructions',5000) : 'Choose the single best answer. Review explanations after submission.', ...(usedRegistry ? {registry:usedRegistry}:{}),questions };
}
const stem = (q: ExamQuestion) => `${q.vignette} ${q.leadIn}`.toLowerCase().replace(/[^a-z0-9]/g,'');
export function addExam(project: Project, exam: SavedExam): Project {
  const existing = (project.savedExams || []).find(x=>x.examId === exam.examId);
  if (existing) {
    if ((exam.contentRevision || 1) < (existing.contentRevision || 1)) throw new Error('A newer revision of this exam is already saved.');
    if ((exam.contentRevision || 1) === (existing.contentRevision || 1)) {
      if (canonical(existing) !== canonical(exam)) throw new Error('That exam ID already exists with different content. Increase contentRevision for an intentional revision, or use a new examId.');
      return project;
    }
  }
  const prior = new Map((project.savedExams || []).filter(x=>x.examId!==exam.examId).flatMap(x=>x.questions).map(q=>[q.metadata.itemId,q]));
  for (const q of exam.questions) {
    const old = prior.get(q.metadata.itemId);
    if (old && (stem(old)!==stem(q) || old.correctAnswer!==q.correctAnswer || JSON.stringify(old.options)!==JSON.stringify(q.options))) throw new Error(`Item ID ${q.metadata.itemId} already belongs to a different question.`);
  }
  const blueprint=[...project.blueprint];
  if(!project.registry && exam.registry) for(const [id,title] of Object.entries(exam.registry.buckets)) if(!blueprint.some(s=>s.id===id)) blueprint.push({id,title,description:'Imported objective bucket',questionCount:String(exam.questions.filter(q=>q.metadata.bucketId===id).length || 1),files:[]});
  return {...project, blueprint, registry:project.registry || exam.registry, savedExams:existing?(project.savedExams || []).map(x=>x.examId===exam.examId?exam:x):[...(project.savedExams || []),exam]};
}
export function beginProjectExam(project: Project, exam: SavedExam, now=Date.now()): Project {
  if (project.activeExam.questions.length && project.activeExam.status==='active') throw new Error('Finish the current exam before starting another.');
  return {...project,activeExam:{...project.activeExam,questions:exam.questions,userAnswers:{},flaggedQuestions:[],status:'active',configOpen:false,examId:exam.examId,attemptId:crypto.randomUUID(),title:exam.title,durationMinutes:exam.durationMinutes,startedAt:now,endsAt:now+exam.durationMinutes*60000}};
}
export function submitProjectExam(project: Project, now=Date.now()): Project {
  const a=project.activeExam;
  if (a.status==='completed' || !a.questions.length) return project;
  const id=a.attemptId || crypto.randomUUID();
  const attempt:ExamAttempt={id,date:new Date(Math.min(now,a.endsAt || now)).toISOString(),score:a.questions.filter(q=>a.userAnswers[q.id]===q.correctAnswer).length,totalQuestions:a.questions.length,answers:{...a.userAnswers},questions:a.questions,flaggedQuestions:[...a.flaggedQuestions]};
  return {...project,examHistory:project.examHistory.some(x=>x.id===id)?project.examHistory:[...project.examHistory,attempt],activeExam:{...a,status:'completed'}};
}
export function mergePracticeBackup(project: Project, value: unknown): Project {
  const state=parseBackup(value); let next=project;
  for (const a of [...state.history,...(state.active?[state.active]:[])]) {
    const exam=parseProjectExam(a.exam,next.registry); next=addExam(next,exam);
    const numberMap=new Map(a.exam.questions.map((q,i)=>[q.id,i+1]));
    const answers=Object.fromEntries(Object.entries(a.answers).map(([id,v])=>[numberMap.get(Number(id))!,v]));
    const flags=a.flags.map(id=>numberMap.get(id)!);
    if (a.completedAt) {
      const imported:ExamAttempt={id:a.id,date:new Date(a.completedAt).toISOString(),score:exam.questions.filter(q=>answers[q.id]===q.correctAnswer).length,totalQuestions:exam.questions.length,questions:exam.questions,answers,flaggedQuestions:flags};
      const prior=next.examHistory.find(x=>x.id===a.id);
      if(prior && canonical(prior)!==canonical(imported)) throw new Error('A restored attempt conflicts with existing history. Your existing work is unchanged.');
      if(!prior) next={...next,examHistory:[...next.examHistory,imported]};
    } else if(!next.examHistory.some(x=>x.id===a.id)) {
      if(next.activeExam.questions.length && next.activeExam.status==='active' && next.activeExam.attemptId!==a.id) throw new Error('Finish the current exam before restoring an active attempt.');
      if(next.activeExam.attemptId!==a.id) next={...next,activeExam:{...emptyExam(),questions:exam.questions,userAnswers:answers,flaggedQuestions:flags,status:'active',configOpen:false,examId:exam.examId,attemptId:a.id,title:exam.title,durationMinutes:exam.durationMinutes,startedAt:a.startedAt,endsAt:a.endsAt}};
    }
  }
  return next.activeExam.endsAt && next.activeExam.endsAt<=Date.now() ? submitProjectExam(next) : next;
}
export function projectShare(p: Project, includeSources=true, includeExams=true) {
  // Explicit allowlist: no user identity, answers, flags, active timers or history.
  return {format:'medexam-project',version:1,name:p.name,description:p.description,questionWritingInstructions:p.questionWritingInstructions || '',styleExamples:p.styleExamples || [],registry:p.registry,referenceTotalQuestions:p.referenceTotalQuestions,
    learningObjectivesFiles:p.learningObjectivesFiles.map(f=>({...f})),blueprint:p.blueprint.map(s=>({...s,files:includeSources?s.files:[]})),savedExams:includeExams?(p.savedExams || []):[],storageMode:'local'};
}
export function importProject(value: any, userId: string, mode:'local'|'cloud', cloudUploadApproved=false): Project {
  const backup=value?.format==='medexam-project-backup'; const v=obj(backup?value.project:value,'Project');
  const registry=v.registry?parseRegistry(v.registry):undefined;
  const file=(f:any)=>{obj(f,'Source file');return {id:ident(f.id,'File ID'),name:str(f.name,'File name',500),type:['pdf','docx','txt','xlsx','pptx','image'].includes(f.type)?f.type:'txt',content:typeof f.content==='string'?f.content.replace(/\0/g,''):'',size:Number(f.size)||0,...(f.kind==='supplement'?{kind:'supplement' as const}:{}),...(f.topicIds?{topicIds:list(f.topicIds,'File topics').map(x=>ident(x,'Topic ID'))}:{})};};
  if(v.storageMode==='local' && mode==='cloud' && !cloudUploadApproved) throw new Error('Confirm saving this device project to your account before uploading its material.');
  const project:Project={id:crypto.randomUUID(),userId,name:str(v.name,'Project name',250),description:typeof v.description==='string'?v.description:'',questionWritingInstructions:typeof v.questionWritingInstructions==='string'?v.questionWritingInstructions:'',styleExamples:v.styleExamples?.length?validateQuestions(v.styleExamples,registry):[],registry,referenceTotalQuestions:int(v.referenceTotalQuestions || 40,'Reference count',1,1000),learningObjectivesFiles:list(v.learningObjectivesFiles || [],'Objective files').map(file),blueprint:list(v.blueprint,'Blueprint').map(s=>({id:ident(s.id,'Section ID'),title:str(s.title,'Section title',250),description:typeof s.description==='string'?s.description:'',questionCount:String(s.questionCount || '1'),files:list(s.files || [],'Section files').map(file)})),savedExams:list(v.savedExams || [],'Saved exams',200).map(e=>parseProjectExam(e,registry,!e.registry)),storageMode:mode,allowOnlineAI:mode==='cloud',lastModified:new Date().toISOString(),examHistory:[],activeExam:emptyExam()};
  if(new Set(project.blueprint.map(x=>x.id)).size!==project.blueprint.length) throw new Error('Duplicate section IDs.');
  if(backup) {
    // Restore into a new project, never overwrite a cloud record or change ownership.
    project.examHistory=list(v.examHistory || [],'History',500).map(a=>{
      const questions=validateQuestions(a.questions,registry,true),answers=obj(a.answers,'Saved answers');
      for(const [k,v] of Object.entries(answers)) if(!questions.some(q=>String(q.id)===k)||!['A','B','C','D'].includes(v as string)) throw new Error('Invalid backup answer.');
      if(!Number.isFinite(Date.parse(a.date))) throw new Error('Invalid attempt date.');
      const flags=list(a.flaggedQuestions || [],'Flags').map(x=>int(x,'Flag',1,1000000));
      if(flags.some(x=>!questions.some(q=>q.id===x))) throw new Error('Invalid saved flag.');
      return {id:ident(a.id,'Attempt ID'),date:a.date,answers,questions,score:questions.filter(q=>answers[q.id]===q.correctAnswer).length,totalQuestions:questions.length,flaggedQuestions:flags};
    });
    if(new Set(project.examHistory.map(a=>a.id)).size!==project.examHistory.length) throw new Error('Duplicate attempt IDs in backup.');
    project.archivedExams=list(v.archivedExams || [],'Unfinished exams',100).map(a=>importProject({format:'medexam-project-backup',project:{...v,examHistory:[],savedExams:[],archivedExams:[],activeExam:a}},userId,mode,cloudUploadApproved).activeExam);
    if(v.activeExam?.questions?.length) {
      const a=v.activeExam,questions=validateQuestions(a.questions,registry,true),answers=obj(a.userAnswers,'Active answers');
      for(const [k,v] of Object.entries(answers)) if(!questions.some(q=>String(q.id)===k)||!['A','B','C','D'].includes(v as string)) throw new Error('Invalid active answer.');
      const duration=int(a.durationMinutes || 30,'Duration',1,240), startedAt=a.startedAt===undefined?undefined:int(a.startedAt,'Start',1,1e14);
      if(startedAt && a.endsAt!==startedAt+duration*60000) throw new Error('Invalid saved timer.');
      const flags=list(a.flaggedQuestions || [],'Flags').map(x=>int(x,'Flag',1,1000000));
      if(flags.some(x=>!questions.some(q=>q.id===x))) throw new Error('Invalid saved flag.');
      project.activeExam={...emptyExam(),questions,userAnswers:answers,flaggedQuestions:flags,status:a.status==='completed'?'completed':'active',configOpen:false,durationMinutes:duration,...(startedAt?{startedAt,endsAt:a.endsAt}:{}),...(a.attemptId?{attemptId:ident(a.attemptId,'Attempt ID')}:{}),...(a.examId?{examId:ident(a.examId,'Exam ID')}:{}),...(a.title?{title:str(a.title,'Title',250)}:{})};
    }
  }
  // Account storage and permission to send sources to Gemini are independent.
  project.allowOnlineAI=mode==='cloud' && v.storageMode!=='local' && v.allowOnlineAI!==false;
  return project;
}
export function allowsOnlineAI(project:Project):boolean {
  return project.allowOnlineAI ?? project.storageMode!=='local';
}

export async function accountCopy(project:Project,userId:string):Promise<Project> {
  if(project.storageMode!=='local') throw new Error('This project is already in an account.');
  if(!userId || userId==='local') throw new Error('Sign in to save this project to your account.');
  // Stable per source and owner: retrying an interrupted upload cannot create duplicates.
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['medexam-account-copy-v1',userId,project.id])))).slice(0,16);
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  return {...structuredClone(project),id,userId,storageMode:'cloud',allowOnlineAI:project.allowOnlineAI===true,cloudSyncedAt:undefined,syncPending:true,syncNotice:undefined,lastModified:new Date().toISOString()};
}
export function downloadText(filename: string, text: string, type='application/json') {
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
