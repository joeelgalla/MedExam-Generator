import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures.ts';
import {importProject,parseProjectExam,projectShare} from '../services/projectWorkflow.ts';
import {parseExam as parsePrivateExam} from '../services/privatePractice.ts';
import {objectiveCoverage,generationObjectivePlan,pendingRechecks} from '../services/objectiveCoverage.ts';
import {verifyGenerationEvidence,verifyGeneratedSet,nearDuplicatePractice} from '../services/generationEvidence.ts';
import {buildPracticeModeContext,computeUnlocks} from '../services/practiceMode.ts';
import {buildGenerationPrompt} from '../services/generationPrompt.ts';
import type {ExamAttempt,UploadedFile} from '../types.ts';

const source:UploadedFile={id:'source',name:'Synthetic fixture',type:'txt',size:80,
 content:'[Original handbook PDF page 1]\nAdding red and blue counters gives the total number of counters.\n[Original handbook PDF page 2]\nSubtraction removes counters from a set.',topicIds:['numbers']};
function project() {
 const f=fixture();
 const registry={...f.registry,topics:{...f.registry.topics,skills:{title:'Performance',bucketId:'basics'}},objectives:{
  'DEMO.1#1':{topicId:'numbers',text:'Combine small sets.'},
  'DEMO.1#2':{topicId:'numbers',text:'Identify a subset.'},
  'SKILL.1':{topicId:'skills',text:'Perform a task.',assessmentType:'skill' as const},
 }};
 return importProject({name:'Synthetic study',registry,referenceTotalQuestions:3,blueprint:[{id:'basics',title:'Foundations',description:'',questionCount:'3',files:[source]}],learningObjectivesFiles:[],savedExams:[f]},'local','local');
}
function attempt(date:string,answer:string):ExamAttempt {
 const q=parseProjectExam(fixture()).questions[0];
 return {id:date,date,score:answer==='B'?1:0,totalQuestions:1,questions:[q],answers:{1:answer}};
}
test('coverage retains untaught objectives and skills with blanks treated as missed tasks and secondary tags excluded',()=>{
 const p=project(),q=p.savedExams![0].questions[0];
 q.metadata.objectiveIds=['DEMO.1#1','DEMO.1#2'];
 const rows=objectiveCoverage(p.registry!,[q,q],[attempt('2026-09-30T01:00:00Z',''),attempt('2026-10-01T01:00:00Z','A')]);
 const primary=rows.find(r=>r.id==='DEMO.1#1')!;
 assert.equal(primary.available,1);assert.equal(primary.answered,1);assert.equal(primary.missed,2);assert.equal(primary.blank,1);assert.equal(primary.assessed,2);
 assert.equal(rows.find(r=>r.id==='DEMO.1#2')!.available,0);
 assert.equal(rows.find(r=>r.id==='DEMO.1#2')!.answered,0);
 assert.equal(rows.find(r=>r.id==='SKILL.1')!.skill,true);
});
test('generation plans recent misses below statistical thresholds, skips skills and includes uncovered entries',()=>{
 const p=project();p.examHistory=[attempt('2026-09-30T01:00:00Z','A')];
 const plan=generationObjectivePlan(p,['basics'],6);
 assert.equal(plan[0],'DEMO.1#1');assert.ok(plan.includes('DEMO.1#2'));assert.ok(!plan.includes('SKILL.1'));
 assert.deepEqual(generationObjectivePlan(p,['absent'],20),[]);
 // A correct retry of the identical item resolves that task, without clearing other concepts.
 p.examHistory.push(attempt('2026-10-01T01:00:00Z','B'));
 assert.equal(generationObjectivePlan(p,['basics'],6)[0],'DEMO.1#2');
});
test('source proof rejects made-up quotes, wrong pages and a different named source',()=>{
 const q=parseProjectExam(fixture()).questions[0];
 q.metadata.sources=[{title:source.name,page:1,quote:'Adding red and blue counters gives the total number of counters.'}];
 assert.doesNotThrow(()=>verifyGenerationEvidence([q],[source]));
 q.metadata.sources[0].page=2;assert.throws(()=>verifyGenerationEvidence([q],[source]),/page/);
 q.metadata.sources[0].page=1;q.metadata.sources[0].quote='A fabricated statement that does not exist anywhere.';
 assert.throws(()=>verifyGenerationEvidence([q],[source]),/could not be matched/);
 q.metadata.sources[0].quote='Adding red and blue counters gives the total number of counters.';
 q.metadata.sourceDocument='An unrelated source';assert.throws(()=>verifyGenerationEvidence([q],[source]),/named source/);
 q.metadata.sources=[];assert.throws(()=>verifyGenerationEvidence([q],[source]),/no supporting/);
 q.metadata.sourceDocument=source.name;q.metadata.sources=[{title:source.name,page:165,quote:'Metformin may cause vitamin B12 deficiency and requires clinical review.'}];
 const ocr={...source,content:'[Original handbook PDF page 168]\nOther material\n[Original handbook PDF page 165 — recovered image text, automatic OCR]\n'+q.metadata.sources[0].quote};
 assert.doesNotThrow(()=>verifyGenerationEvidence([q],[ocr]));q.metadata.sources[0].page=168;assert.throws(()=>verifyGenerationEvidence([q],[ocr]),/page/);
});
test('quotes, task descriptions and skill classification survive project and private sharing without results',()=>{
 const p=project(),q=p.savedExams![0].questions[0];
 q.metadata.sources=[{title:source.name,page:1,quote:'Adding red and blue counters gives the total number of counters.'}];
 q.metadata.coverageNote='Combining two sets; this does not test subtraction.';
 q.metadata.rechecksItemId='a-previous-missed-task';
 p.examHistory=[attempt('2026-10-01T01:00:00Z','A')];
 const friend=importProject(projectShare(p,true,true),'friend','local');
 assert.equal(friend.examHistory.length,0);assert.deepEqual(friend.savedExams![0].questions[0].metadata.sources,q.metadata.sources);
 assert.equal(friend.registry!.objectives['SKILL.1'].assessmentType,'skill');
 const privateExam=parsePrivateExam({...p.savedExams![0],format:'medexam-practice',registry:p.registry});
 assert.equal(privateExam.questions[0].metadata.coverageNote,q.metadata.coverageNote);
 assert.equal(privateExam.questions[0].metadata.rechecksItemId,q.metadata.rechecksItemId);
 assert.equal(privateExam.registry!.objectives['SKILL.1'].assessmentType,'skill');
});
test('another correct fact under the same objective does not clear a miss; an explicit new-case recheck can',()=>{
 const missed=attempt('2026-09-30T01:00:00Z','');
 const another=attempt('2026-10-01T01:00:00Z','B');another.questions[0].metadata.itemId='different-task';
 assert.equal(pendingRechecks([missed,another]).length,1);
 const recheck=structuredClone(another);recheck.date='2026-10-01T02:00:00Z';recheck.questions[0].metadata.itemId='new-case';
 recheck.questions[0].metadata.rechecksItemId=missed.questions[0].metadata.itemId;
 assert.equal(pendingRechecks([missed,another,recheck]).length,0);
 recheck.answers[1]='';assert.equal(pendingRechecks([missed,another,recheck]).length,1);
 const finalCheck=structuredClone(recheck);finalCheck.date='2026-10-01T03:00:00Z';finalCheck.answers[1]='B';finalCheck.questions[0].metadata.itemId='third-case';finalCheck.questions[0].metadata.rechecksItemId='new-case';
 assert.equal(pendingRechecks([missed,another,recheck,finalCheck]).length,0);
});
test('planned objectives select complete relevant chapters and require clinical evidence in generation',()=>{
 const p=project();p.activeExam.questionCount=2;
 const prompt=buildGenerationPrompt(p);
 assert.ok(prompt.includes('PLANNED PRIMARY OBJECTIVES:'));assert.ok(prompt.includes(source.content));
 assert.ok(prompt.includes('Objective titles alone are not clinical evidence'));
 assert.ok(prompt.includes('optional directly tested secondary ID'));
});

test('a skipped completed item immediately enables targeted practice and counts as a miss without inventing an answer',()=>{
 const history=[attempt('2026-10-01T01:00:00Z','')];
 const ctx=buildPracticeModeContext(history);
 assert.equal(ctx.totalAnswered,0);assert.equal(ctx.totalAssessed,1);
 assert.equal(ctx.loStats[0].totalAttempts,1);assert.equal(ctx.loStats[0].totalCorrect,0);
 assert.equal(ctx.recentWrongStems.length,1);assert.equal(computeUnlocks(history).targeted.unlocked,true);
 const p=project();p.examHistory=history;p.activeExam.practiceMode='targeted';
 assert.equal(generationObjectivePlan(p,['basics'],1)[0],'DEMO.1#1');
});
test('repeating one correct question cannot certify strength in the objective',()=>{
 const history=Array.from({length:10},(_,n)=>attempt(`2026-10-${String(n+1).padStart(2,'0')}T01:00:00Z`,'B'));
 const stats=buildPracticeModeContext(history).loStats[0];
 assert.equal(stats.distinctItems,1);assert.equal(stats.mastered,false);
});
test('generation cannot silently omit a planned objective, return fewer items or add a giveaway',()=>{
 const p=project();p.savedExams=[];p.activeExam.questionCount=2;
 const qs=parseProjectExam(fixture()).questions.slice(0,2);
 qs[1].metadata.objectiveIds=['DEMO.1#2'];
 assert.doesNotThrow(()=>verifyGeneratedSet(qs,p));
 assert.throws(()=>verifyGeneratedSet(qs.slice(0,1),p),/incomplete/);
 qs[1].metadata.objectiveIds=['DEMO.1#1'];assert.throws(()=>verifyGeneratedSet(qs,p),/planned objectives/);
 qs[1].metadata.objectiveIds=['DEMO.1#2'];qs[1].options.D='Another condition as the sole explanation';
 assert.throws(()=>verifyGeneratedSet(qs,p),/giveaway/);
 const partial=verifyGeneratedSet(qs,p,true);assert.equal(partial.questions.length,1);assert.equal(partial.excluded.length,1);
});
test('a plan caps complete source topics and rotates untouched topics into later sets',()=>{
 const p=project();p.registry!.topics={};p.registry!.objectives={};p.savedExams=[];
 for(let n=0;n<10;n++) {p.registry!.topics[`topic-${n}`]={title:`Topic ${n}`,bucketId:'basics'};for(let k=0;k<4;k++)p.registry!.objectives[`LO-${n}-${k}`]={topicId:`topic-${n}`,text:`Task ${n}/${k}`};}
 const first=generationObjectivePlan(p,['basics'],20);assert.equal(first.length,20);assert.equal(new Set(first.map(id=>p.registry!.objectives[id].topicId)).size,6);
 p.examHistory=[{...attempt('2026-10-01T01:00:00Z','B'),questions:first.map((id,n)=>({...parseProjectExam(fixture()).questions[0],id:n+1,metadata:{...parseProjectExam(fixture()).questions[0].metadata,objectiveIds:[id],topicId:p.registry!.objectives[id].topicId,itemId:`item-${n}`}})),answers:Object.fromEntries(first.map((id,n)=>[n+1,'B']))}];
 const second=generationObjectivePlan(p,['basics'],20);assert.ok(second.some(id=>!first.some(old=>p.registry!.objectives[old].topicId===p.registry!.objectives[id].topicId)));
});

test('near-duplicate gate catches changed names/numbers when the decision and key are retained',()=>{
 const q=parseProjectExam(fixture()).questions[0],variant=structuredClone(q);variant.metadata.itemId='another';variant.vignette=variant.vignette.replace('1 red','9 red');
 assert.equal(nearDuplicatePractice(q,variant),true);variant.correctAnswer='D';assert.equal(nearDuplicatePractice(q,variant),false);
});
