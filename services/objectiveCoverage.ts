import type { ExamAttempt, ExamQuestion, ObjectiveRegistry, Project } from '../types.ts';

export type ObjectiveCoverageRow = {
  id: string; text: string; topicId: string; topic: string; bucketId: string; bucket: string;
  skill: boolean; available: number; answered: number; assessed:number; blank:number; correct: number; missed: number;
};
const answered = (value: unknown): value is string => typeof value === 'string' && /^[A-D]$/.test(value);
export const studyItemKey = (q: ExamQuestion) => {
  if(q.metadata.itemId)return q.metadata.itemId;
  const text=`${q.vignette}\n${q.leadIn}`;let hash=2166136261;
  for(const c of text)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  return `legacy-${(hash>>>0).toString(16)}`;
};

// A different correct concept within the same broad objective cannot erase a missed rule.
export function pendingRechecks(history:ExamAttempt[]):ExamQuestion[] {
  const pending=new Map<string,ExamQuestion>();
  const roots=new Map<string,string>();
  for(const attempt of [...history].sort((a,b)=>a.date.localeCompare(b.date)))for(const q of attempt.questions) {
    const key=studyItemKey(q);
    const link=q.metadata.rechecksItemId;
    const root=link?(roots.get(link)||link):(roots.get(key)||key);roots.set(key,root);
    if(attempt.answers[q.id]===q.correctAnswer)pending.delete(root);
    else {pending.delete(root);pending.set(root,{...q,metadata:{...q.metadata,itemId:root}});}
  }
  return [...pending.values()].reverse();
}

export function plannedRechecks(project:Project, plan:string[]):ExamQuestion[] {
  const seen=new Set<string>();
  return pendingRechecks(project.examHistory).filter(q=>{
    const id=q.metadata.objectiveIds?.[0];
    if(!id || !plan.includes(id) || seen.has(id))return false;
    seen.add(id);return true;
  });
}

// A tag establishes a sampled task, not completion of an entire objective.
// Blanks in submitted exams count as missed; repeated items do not increase available coverage.
export function objectiveCoverage(registry: ObjectiveRegistry, questions: ExamQuestion[], history: ExamAttempt[]): ObjectiveCoverageRow[] {
  const rows = Object.entries(registry.objectives).map(([id,o]) => ({
    id, text:o.text || id, topicId:o.topicId, topic:registry.topics[o.topicId].title,
    bucketId:registry.topics[o.topicId].bucketId, bucket:registry.buckets[registry.topics[o.topicId].bucketId],
    skill:o.assessmentType==='skill', available:0, answered:0, assessed:0, blank:0, correct:0, missed:0,
  }));
  const byId = new Map(rows.map(r=>[r.id,r]));
  const bankItems = new Map<string,Set<string>>();
  for(const q of questions) for(const id of (q.metadata.objectiveIds || []).slice(0,1)) {
    if(!byId.has(id)) continue;
    const keys=bankItems.get(id) || new Set<string>();keys.add(studyItemKey(q));bankItems.set(id,keys);
  }
  for(const [id,keys] of bankItems) byId.get(id)!.available=keys.size;
  for(const attempt of history) for(const q of attempt.questions) {
    for(const id of (q.metadata.objectiveIds || []).slice(0,1)) {
      const row=byId.get(id);if(!row)continue;
      row.assessed++;
      if(answered(attempt.answers[q.id]))row.answered++;else row.blank++;
      if(attempt.answers[q.id]===q.correctAnswer)row.correct++;else row.missed++;
    }
  }
  return rows;
}

// Plan from submitted tasks, not the objectives that happen to occur in an uploaded manual.
// Keep the selected buckets broad; give recent misses a small recheck allocation even below the weak-LO sample threshold.
export function generationObjectivePlan(project: Project, bucketIds: string[], count: number): string[] {
  if(!project.registry) return [];
  const rows=objectiveCoverage(project.registry,(project.savedExams || []).flatMap(e=>e.questions),project.examHistory)
    .filter(r=>bucketIds.includes(r.bucketId) && !r.skill);
  const picked: string[]=[];
  // A short set uses complete chapters from at most six topics; rotate through other topics in later sets.
  const topics=new Set<string>();
  const canPick=(id:string)=>{const row=rows.find(r=>r.id===id);return !!row&&(topics.has(row.topicId)||topics.size<6);};
  const pick=(id:string)=>{picked.push(id);topics.add(rows.find(r=>r.id===id)!.topicId);};
  const mode=project.activeExam.practiceMode || 'balanced';
  const reviewLimit=mode==='targeted'?count:mode==='focused'?Math.ceil(count/2):Math.min(4,Math.floor(count/4));
  for(const q of pendingRechecks(project.examHistory)) {
    for(const id of (q.metadata.objectiveIds || []).slice(0,1)) {
      if(canPick(id) && !picked.includes(id) && picked.length<reviewLimit)pick(id);
    }
  }
  const buckets=new Map<string,ObjectiveCoverageRow[]>();
  for(const row of rows) {const bucket=buckets.get(row.bucketId) || [];bucket.push(row);buckets.set(row.bucketId,bucket);}
  for(const rs of buckets.values())rs.sort((a,b)=>a.assessed-b.assessed || a.available-b.available || a.id.localeCompare(b.id,undefined,{numeric:true}));
  while(picked.length<Math.min(count,rows.length)) {
    let changed=false;
    const order=[...buckets].sort(([a],[b])=>picked.filter(id=>rows.find(r=>r.id===id)?.bucketId===a).length-picked.filter(id=>rows.find(r=>r.id===id)?.bucketId===b).length);
    for(const [,rs] of order) {
      const row=rs.filter(r=>!picked.includes(r.id)&&canPick(r.id)).sort((a,b)=>
        picked.filter(id=>rows.find(r=>r.id===id)?.topicId===a.topicId).length-picked.filter(id=>rows.find(r=>r.id===id)?.topicId===b.topicId).length || a.assessed-b.assessed || a.available-b.available)[0];
      if(row && picked.length<count){pick(row.id);changed=true;}
    }
    if(!changed)break;
  }
  return picked;
}
