import type { ExamQuestion, Project, UploadedFile } from '../types.ts';
import { generationObjectivePlan, plannedRechecks, studyItemKey } from './objectiveCoverage.ts';
const normalize = (text:string)=>text.normalize('NFKC').replace(/\\[nrt]/g,' ').replace(/\s+/g,' ').trim();
const trigrams=(text:string)=>{const words=normalize(text).toLowerCase().replace(/[\d.]+/g,'#').match(/[\p{L}#]+/gu)||[];return new Set(words.slice(0,-2).map((_,i)=>words.slice(i,i+3).join(' ')));};
const overlap=(a:Set<string>,b:Set<string>)=>a.size&&b.size?2*[...a].filter(x=>b.has(x)).length/(a.size+b.size):0;
export function nearDuplicatePractice(q:ExamQuestion,other:ExamQuestion):boolean {
  const stem=overlap(trigrams(`${q.vignette} ${q.leadIn}`),trigrams(`${other.vignette} ${other.leadIn}`));
  const key=normalize(q.options[q.correctAnswer]).toLowerCase(),oldKey=normalize(other.options[other.correctAnswer]).toLowerCase();
  const sameAnswer=key===oldKey||overlap(trigrams(key),trigrams(oldKey))>=.8;
  return sameAnswer && stem>=(q.metadata.rechecksItemId? .9 : .65);
}

// Checks quotation fidelity. A real quote is not clinical certification of the key or its interpretation.
export function verifyGenerationEvidence(questions: ExamQuestion[], files: UploadedFile[]): void {
  const normalized=new Map(files.map(f=>[f.name,normalize(f.content)]));
  for(const q of questions) {
    const quoted=q.metadata.sources?.filter(s=>s.quote);
    if(!quoted?.length)throw new Error(`Question ${q.id} has no supporting source passage. This set was not saved; no automatic retry was made.`);
    for(const s of quoted) {
      const content=normalized.get(s.title), quote=normalize(s.quote!);
      if(!content || quote.length<25 || !content.includes(quote))throw new Error(`Question ${q.id} returned a passage that could not be matched to your study material. This set was not saved.`);
      if(s.page!==undefined && content.includes('[Original handbook PDF page ')) {
        let index=content.indexOf(quote), matches=false;
        while(index!==-1) {
          const markers=[...content.slice(0,index).matchAll(/\[Original handbook PDF page (\d+)(?:\s+[^\]]*)?\]/g)];
          if(Number(markers.at(-1)?.[1])===s.page){matches=true;break;}
          index=content.indexOf(quote,index+1);
        }
        if(!matches)throw new Error(`Question ${q.id} has a source page that does not match its passage. This set was not saved.`);
      }
    }
    if(!quoted.some(s=>s.title===q.metadata.sourceDocument))throw new Error(`Question ${q.id} did not support its named source document. This set was not saved.`);
  }
}

// Measurable gates, not certification of clinical accuracy or plausible competing options.
export function verifyGeneratedSet(questions:ExamQuestion[], project:Project, allowPartial=false):{questions:ExamQuestion[];excluded:{id:number;objectiveId?:string;reason:string}[]} {
  const count=project.activeExam.questionCount;
  if(questions.length>count || (!allowPartial&&questions.length!==count))throw new Error(`The AI returned ${questions.length} of ${count} requested questions. The incomplete set was not saved.`);
  const ids=project.activeExam.selectedSectionIds || project.blueprint.map(s=>s.id);
  const plan=generationObjectivePlan(project,ids,count);
  const primaries=questions.map(q=>q.metadata.objectiveIds?.[0]);
  const rechecks=new Map(plannedRechecks(project,plan).map(q=>[q.metadata.objectiveIds![0],studyItemKey(q)]));
  if(plan.length && !allowPartial && (plan.some(id=>!primaries.includes(id)) || primaries.some(id=>!id || !plan.includes(id)))) {
    throw new Error('The generated set did not follow the planned objectives. It was not saved; your objective gaps are unchanged.');
  }
  const previous=[...(project.savedExams || []).flatMap(e=>e.questions),...project.examHistory.flatMap(a=>a.questions),...(project.styleExamples || [])];
  const signature=(q:ExamQuestion)=>normalize(`${q.vignette} ${q.leadIn}`).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const seen=new Set(previous.map(signature));
  const itemIds=new Set(previous.map(q=>q.metadata.itemId).filter(Boolean));
  const objectiveTexts=Object.values(project.registry?.objectives || {}).map(o=>normalize(o.text || '')).filter(Boolean);
  const loText=normalize(project.learningObjectivesFiles.map(f=>f.content).join(' '));
  const accepted:ExamQuestion[]=[],excluded:{id:number;objectiveId?:string;reason:string}[]=[];
  for(const q of questions) {
   try {
    if(plan.length && (!q.metadata.objectiveIds?.[0]||!plan.includes(q.metadata.objectiveIds[0])))throw new Error(`Question ${q.id} did not follow the planned objectives.`);
    const requiredRecheck=rechecks.get(q.metadata.objectiveIds?.[0]||'');
    if(requiredRecheck&&q.metadata.rechecksItemId!==requiredRecheck)throw new Error(`Question ${q.id} did not identify its planned missed task. The set was not saved.`);
    if(q.metadata.rechecksItemId&&q.metadata.rechecksItemId!==requiredRecheck)throw new Error(`Question ${q.id} claimed an unrelated task recheck. The set was not saved.`);
    if((q.metadata.objectiveIds?.length||0)>2)throw new Error(`Question ${q.id} tags more than two objectives. The set was not saved.`);
    if(seen.has(signature(q)) || (q.metadata.itemId && itemIds.has(q.metadata.itemId)))throw new Error('The AI repeated an existing item. This set was not saved.');
    if([...previous,...accepted].some(old=>nearDuplicatePractice(q,old)))throw new Error(`Question ${q.id} was too similar to a previous practice case and answer.`);

    if(Object.values(q.options).some(s=>/as the sole explanation/i.test(s)))throw new Error(`Question ${q.id} contains a giveaway option. This set was not saved.`);
    const lengths=Object.entries(q.options).filter(([letter])=>letter!==q.correctAnswer).map(([,s])=>s.length).sort((a,b)=>a-b);
    if(q.options[q.correctAnswer].length>Math.max(50,lengths[1]*2.2))throw new Error(`Question ${q.id} has a conspicuously longer answer. This set was not saved.`);
    if(q.metadata.sources?.some(s=>s.quote && objectiveTexts.some(t=>t.includes(normalize(s.quote!)))))throw new Error(`Question ${q.id} quoted an objective heading instead of clinical support. This set was not saved.`);
    if(!project.registry && project.learningObjectivesFiles.length && !(q.metadata.losTested || []).some(lo=>loText.includes(normalize(lo))))throw new Error(`Question ${q.id} did not use exact wording from the supplied learning objectives. This set was not saved.`);
    accepted.push(q);seen.add(signature(q));if(q.metadata.itemId)itemIds.add(q.metadata.itemId);
   } catch(e) {if(!allowPartial)throw e;excluded.push({id:q.id,objectiveId:q.metadata.objectiveIds?.[0],reason:(e as Error).message});}
  }
  if(!accepted.length)throw new Error('No questions passed the objective and wording checks. Your existing exams and gaps are unchanged.');
  return {questions:accepted,excluded};
}
