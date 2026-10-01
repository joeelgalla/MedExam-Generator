import type { Project, ExamQuestion } from '../types.ts';
import { SYSTEM_INSTRUCTION } from '../lib/examRules.ts';
import { MAX_CONTEXT_CHARS } from '../lib/requestLimits.ts';
export { MAX_CONTEXT_CHARS } from '../lib/requestLimits.ts';
import { buildPracticeDirective, buildPracticeModeContext, isModeUnlocked } from './practiceMode.ts';
import { generationObjectivePlan, plannedRechecks, studyItemKey } from './objectiveCoverage.ts';
export const MAX_BUILTIN_QUESTIONS = 20;
export function selectedSections(project: Project) {
  const ids=project.activeExam.selectedSectionIds;
  return ids ? project.blueprint.filter(s=>ids.includes(s.id)) : project.blueprint;
}
export function questionSources(project:Project,q:ExamQuestion) {
  const sections=project.blueprint.filter(s=>s.id===q.metadata.bucketId);
  const files=(sections.length?sections:project.blueprint).flatMap(s=>s.files);
  const relevant=files.filter(f=>f.name===q.metadata.sourceDocument || (q.metadata.topicId && f.topicIds?.includes(q.metadata.topicId)));
  return relevant.length?relevant:[...project.learningObjectivesFiles,...files];
}
function objectiveFiles(project:Project,plan:string[]) {
  return project.registry&&plan.length&&plan.every(id=>project.registry!.objectives[id].text?.trim())?[]:project.learningObjectivesFiles;
}
export function generationSources(project:Project) {
  const sections=selectedSections(project),plan=generationObjectivePlan(project,sections.map(s=>s.id),project.activeExam.questionCount);
  const topics=new Set(plan.map(id=>project.registry!.objectives[id].topicId));
  return [...objectiveFiles(project,plan),...sections.flatMap(s=>s.files.filter(f=>!f.topicIds?.length||!topics.size||f.topicIds.some(id=>topics.has(id))))];
}
export function buildGenerationPrompt(project: Project, includeSources=true): string {
  const sections=selectedSections(project);
  if(!sections.length) throw new Error('Select at least one content section.');
  if(!project.learningObjectivesFiles.length && !project.registry && !sections.some(s=>s.files.some(f=>f.content.trim()))) throw new Error('Add learning objectives or reference material before generating an exam.');
  const count=project.activeExam.questionCount;
  if(!Number.isInteger(count)||count<1||count>200) throw new Error('Choose 1–200 questions.');
  const topicIds=new Set(project.registry?Object.entries(project.registry.topics).filter(([,t])=>sections.some(s=>s.id===t.bucketId)).map(([id])=>id):[]);
  const registry=project.registry ? {...project.registry,objectives:Object.fromEntries(Object.entries(project.registry.objectives).filter(([,o])=>topicIds.has(o.topicId))),topics:Object.fromEntries(Object.entries(project.registry.topics).filter(([id])=>topicIds.has(id))),buckets:Object.fromEntries(Object.entries(project.registry.buckets).filter(([id])=>sections.some(s=>s.id===id)))} : undefined;
  if(registry && !Object.keys(registry.objectives).length) throw new Error('The selected sections have no mapped objective IDs. Select a registry bucket or correct the project section mapping.');
  const ctx=buildPracticeModeContext(project.examHistory);
  const objectivePlan=generationObjectivePlan(project,sections.map(s=>s.id),count);
  if(project.registry&&!objectivePlan.length)throw new Error('These sections contain performance skills rather than mapped written knowledge tasks. Select a knowledge topic for question practice.');
  if(registry)registry.objectives=Object.fromEntries(Object.entries(registry.objectives).filter(([id])=>objectivePlan.includes(id)));
  const rechecks=plannedRechecks(project,objectivePlan).map(q=>({primaryObjectiveId:q.metadata.objectiveIds![0],rechecksItemId:studyItemKey(q),task:q.metadata.coverageNote||q.leadIn,rule:q.explanation}));
  const plannedTopics=new Set(objectivePlan.map(id=>project.registry!.objectives[id].topicId));
  const requestSections=sections.map(s=>({...s,files:s.files.filter(f=>!f.topicIds?.length || !plannedTopics.size || f.topicIds.some(id=>plannedTopics.has(id)))}));
  const mode=project.activeExam.practiceMode || 'balanced';
  const directive=buildPracticeDirective(isModeUnlocked(mode,project.examHistory)?mode:'balanced',ctx);
  const context=[SYSTEM_INSTRUCTION,
    `PROJECT: ${project.name}\nCONTEXT: ${project.description}\nQUESTION WRITING INSTRUCTIONS:\n${project.questionWritingInstructions || 'Use the standard rules above.'}`,
    `WORKED STYLE EXAMPLES (original practice items, not historical recalls; do not reproduce these cases, clues, wording or decision combinations):\n${JSON.stringify(project.styleExamples || [])}`,
    `OFFICIAL OBJECTIVE REGISTRY (this request uses complete objective wording from the registry when available; the original objective files remain in the project library. Use only exact objective IDs from this selection, preserving topic/bucket relationships):\n${registry?JSON.stringify(registry):'No structured registry supplied; use the learning-objective wording and section titles.'}`,
    objectiveFiles(project,objectivePlan).map(f=>`--- START OF LEARNING OBJECTIVE FILE: ${f.name} ---\n${f.content}\n--- END OF LEARNING OBJECTIVE FILE ---`).join('\n'),
    requestSections.map(s=>`=== SECTION: ${s.title} [${s.id}] ===\nReference question count: ${s.questionCount} of ${project.referenceTotalQuestions}\n${s.description}\n${includeSources?s.files.map(f=>`--- FILE (${s.title}): ${f.name} ---\n${f.content}\n--- END FILE ---`).join('\n'):s.files.map(f=>`Source to attach separately: ${f.name}`).join('\n')}`).join('\n'),
  ].join('\n\n');
  if(context.length>MAX_CONTEXT_CHARS) throw new Error('Selected context is too large. Select fewer sections; no source text has been silently cut.');
  const avoided=[...(project.savedExams || []).flatMap(e=>e.questions),...project.examHistory.flatMap(a=>a.questions)];
  const unique=new Map(avoided.map(q=>[q.metadata.itemId || `${q.vignette}\n${q.leadIn}`,q]));
  const avoid=[...unique.values()].filter(q=>!registry || !q.metadata.topicId || topicIds.has(q.metadata.topicId)).map(q=>({itemId:q.metadata.itemId,caseSummary:q.vignette.slice(0,220),leadIn:q.leadIn.slice(0,220)}));
  const difficulty=project.activeExam.difficulty;
  const instructions=difficulty==='standard'?'Match the worked examples at the core clinical clerkship level. Include discriminating factual criteria, thresholds, intervals and drug-class choices as well as clinical decisions; avoid trivial label recognition.':difficulty==='hard'?'Add a close competing diagnosis or next action, with relevant discriminating findings. Keep one defensible best answer.':'Use subtle contraindications and prioritization, while preserving one best answer.';
  const prompt=`${context}\n\nCURRENT REQUEST:\n${objectivePlan.length?`PLANNED PRIMARY OBJECTIVES: ${objectivePlan.join(", ")}\nWrite one question per planned objective where the supplied clinical material supports it; use a close competing choice and a new case. These are specific sampled knowledge tasks, not whole-objective mastery. Recent wrong and blank tasks receive rechecks even below the statistical weak-objective threshold. The source library is restricted to complete chapters for these planned topics, plus unstructured shared files; no chapter text was cut. If clinical support is missing, state the source gap instead of inventing a fact.\n`:""}PLANNED RECHECK TASKS (test the specific missed rule, not an easier different fact under the same objective; these previous explanations are provisional, verify against the source): ${JSON.stringify(rechecks)}\nGenerate exactly ${count} original questions. Difficulty: ${difficulty}. ${instructions}\nDuration: ${project.activeExam.durationMinutes || Math.ceil(count*1.5)} minutes. Follow the planned primary objectives when provided. Otherwise scale the selected section counts proportionally; these are practice allocations, not official exam percentages. Preserve linked case questions together using caseId where appropriate.\n${directive}\nCOMPLETED-EXAM EVIDENCE (blanks count as wrong; limited samples are not mastery; IDs resolve to wording in the registry):\n${JSON.stringify(ctx.loStats.map(x=>({objective:x.lo,assessed:x.totalAttempts,correct:x.totalCorrect,weak:x.weak,strongEvidence:x.mastered})))}\nPREVIOUS PRACTICE ITEMS TO AVOID (compact 220-character case/lead-in summaries; change the clinical scenario and decision, not merely names/numbers):\n${JSON.stringify(avoid)}\n\nReturn JSON only: {\"exam\":[...]}. Every question has id (unique integer), vignette, leadIn, options {A,B,C,D}, correctAnswer (A-D), explanation (justify the key and each distractor), metadata {losTested:[verbatim objective wording from the supplied file or registry],cluster,cognitiveLevel (1.1/1.2/1.3),subtype,week (0 if no weeks),sourceDocument (exact filename),itemId (new unique string),${registry?'objectiveIds:[primary tested ID, optional directly tested secondary ID],topicId,bucketId,':''}sources:[{title,quote,page?}],coverageNote (specific task sampled),rechecksItemId (copy the specified ID for a planned recheck),caseId?}. Omit optional fields when absent; do not return question-mark notation. Use new itemIds. Provide at least one short exact continuous clinical supporting quote from a supplied file for every answer key; set sources.title to that file’s exact filename and sourceDocument to the same filename. Copy a continuous passage exactly: do not join separate sentences with ellipses or rephrase the quotation. Objective titles alone are not clinical evidence. Page numbers must match the source’s original PDF page markers; otherwise omit them. No external sources invented from model memory. Flag uncertain/outdated source facts in the explanation; do not fabricate source pages. Check exactly one best answer, homogeneous distractors, no answer-length pattern, no repeated scenario and correct objective mapping.\nThe historical recall bank is deliberately absent. Do not request or recreate it. Structural validation does not certify clinical accuracy or matched exam difficulty. A local recall comparison remains a separate review step before high-stakes mock use.`;
  if(prompt.length>MAX_CONTEXT_CHARS) throw new Error('Context plus previous-question history is too large. Select fewer sections or export a smaller project; nothing was truncated.');
  return prompt;
}
export function externalPacket(project:Project,includeSources=true) {
  return `# ${project.name}: next practice exam\n\nAttach this file to Codex or Claude. Return one JSON file containing {"exam":[...]} for Import exam in this same project. These instructions describe practice material; independently verify clinical accuracy.\n\n${buildGenerationPrompt(project,includeSources)}\n`;
}
