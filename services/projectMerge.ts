import type {Project,SavedExam} from '../types.ts';
// Order-insensitive equality for imported JSON objects; array order remains meaningful.
export const canonical = (v:unknown):string => JSON.stringify(sort(v));
function sort(v:any):any {return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,sort(v[k])])):v;}
function union<T>(remote:T[],local:T[],key:(x:T)=>string,label:string):T[] {
 const rows=new Map(remote.map(x=>[key(x),x]));
 for(const item of local){const old=rows.get(key(item));if(old&&canonical(old)!==canonical(item))throw new Error(`Conflicting ${label} ${key(item)}. Both copies are preserved. Download your device backup, then reload to open separate recovery and cloud copies.`);rows.set(key(item),item);}
 return [...rows.values()];
}
function mergeBanks(remote:SavedExam[],local:SavedExam[]):SavedExam[] {
 const rows=new Map(remote.map(x=>[x.examId,x]));
 for(const item of local) {
  const old=rows.get(item.examId);
  if(old && (old.contentRevision || 1)!==(item.contentRevision || 1)) {
   if((item.contentRevision || 1)>(old.contentRevision || 1))rows.set(item.examId,item);
  } else if(old) {
   union([old],[item],x=>x.examId,'exam');
  } else rows.set(item.examId,item);
 }
 return [...rows.values()];
}
export function mergeProjectCopies(local:Project,remote:Project,baseline?:Project):Project {
 if(local.id!==remote.id || local.userId!==remote.userId)throw new Error('Project ownership mismatch.');
 const voidedAttemptIds=[...new Set([...(remote.voidedAttemptIds || []),...(local.voidedAttemptIds || [])])];
 const voided=new Set(voidedAttemptIds);
 const examHistory=union((remote.examHistory || []).filter(x=>!voided.has(x.id)),(local.examHistory || []).filter(x=>!voided.has(x.id)),x=>x.id,'attempt');
 const savedExams=mergeBanks(remote.savedExams || [],local.savedExams || []);
 const archivedExams=union((remote.archivedExams || []).filter(x=>!voided.has(x.attemptId || '')),(local.archivedExams || []).filter(x=>!voided.has(x.attemptId || '')),x=>x.attemptId || canonical(x),'unfinished exam');
 const latest={...(local.lastModified>=remote.lastModified?local:remote)};
 // Studying in an older tab must not undo a newly repaired recipe or source map.
 for(const key of ['name','description','questionWritingInstructions','styleExamples','examReferenceFiles','sourcePolicy','registry','blueprint','referenceTotalQuestions','learningObjectivesFiles'] as const) {
  if(baseline&&canonical(local[key])===canonical(baseline[key]))(latest as any)[key]=remote[key];
 }
 const a=local.activeExam,b=remote.activeExam;
 const unfinished=(x:typeof a)=>x.status==='active'&&x.questions.length>0&&!voided.has(x.attemptId || '')&&!examHistory.some(h=>h.id===x.attemptId);
 if(unfinished(a)&&unfinished(b)&&a.attemptId!==b.attemptId)throw new Error('Two devices have different unfinished exams. Finish one, then retry sync; your device copy is preserved.');
 let activeExam=latest.activeExam;
 if(voided.has(activeExam.attemptId || '')) activeExam=voided.has(a.attemptId || '')?b:a;
 // A newer settings-only edit cannot erase another device's running exam.
 // An explicit set-aside is preserved by its matching archived attempt.
 if(unfinished(a)!==unfinished(b)) {
  const running=unfinished(a)?a:b;
  if(!archivedExams.some(x=>x.attemptId===running.attemptId))activeExam=running;
 }
 if(unfinished(a)&&unfinished(b)&&a.attemptId===b.attemptId) {
  if(canonical(a.questions)!==canonical(b.questions)) throw new Error('The active exam differs between devices. Both copies are preserved; download a backup before resolving.');
  const base=baseline?.activeExam.attemptId===a.attemptId?baseline.activeExam:undefined;
  const answers={...b.userAnswers};
  for(const [id,answer] of Object.entries(a.userAnswers)) {
   const other=b.userAnswers[Number(id)], original=base?.userAnswers[Number(id)];
   if(other && other!==answer) {
    if(!base || (answer!==original && other!==original)) throw new Error('Two devices changed the same answer. Both copies are preserved. Download a backup, then reload to open separate recovery and cloud copies.');
    answers[Number(id)]=answer===original?other:answer;
   } else answers[Number(id)]=answer;
  }
  const flags=new Set([...a.flaggedQuestions,...b.flaggedQuestions]);
  if(base) for(const id of flags) {
   const original=base.flaggedQuestions.includes(id),l=a.flaggedQuestions.includes(id),r=b.flaggedQuestions.includes(id);
   if(!(l!==original?l:r)) flags.delete(id);
  }
  activeExam={...activeExam,userAnswers:answers,flaggedQuestions:[...flags]};
 }
 const completed=examHistory.find(h=>h.id===activeExam.attemptId);
 if(completed) activeExam={...activeExam,status:'completed',questions:completed.questions,userAnswers:completed.answers,flaggedQuestions:completed.flaggedQuestions || []};
 return {...latest,examHistory,voidedAttemptIds,savedExams,archivedExams:archivedExams.filter(a=>a.attemptId!==activeExam.attemptId&&!examHistory.some(h=>h.id===a.attemptId)),activeExam};
}
