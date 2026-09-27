import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures.ts';
import {importProject,projectShare,parseProjectExam,addExam,beginProjectExam,submitProjectExam,mergePracticeBackup,emptyExam,accountCopy,allowsOnlineAI,validateGeneratedQuestions} from '../services/projectWorkflow.ts';
import {buildGenerationPrompt,externalPacket,questionSources} from '../services/generationPrompt.ts';
import {totalAnsweredQuestions,buildPracticeModeContext} from '../services/practiceMode.ts';
import {emptyState,startAttempt,finishAttempt,recordAnswer,parseExam,backup} from '../services/privatePractice.ts';
function project() {
 const f=fixture();
 return importProject({name:'Synthetic rotation',description:'context marker',questionWritingInstructions:'recipe marker',registry:{...f.registry,objectives:{...f.registry.objectives,'DEMO.1#1':{topicId:'numbers',text:'Combine small sets.'}}},learningObjectivesFiles:[{id:'lo',name:'Objectives.txt',type:'txt',content:'objective marker',size:16}],referenceTotalQuestions:60,blueprint:[{id:'basics',title:'Foundations',description:'Core',questionCount:'60',files:[{id:'f',name:'Synthetic fixture',type:'txt',content:'source marker',size:13,topicIds:['numbers']}]}],styleExamples:[f.questions[0]],savedExams:[]},'local','local');
}
test('project recipe, selected objectives, source names and targeting share one prompt',()=>{
 let p=project();p.activeExam.questionCount=3;
 const exam=parseProjectExam(fixture(),p.registry);p=addExam(p,exam);
 for(let i=0;i<5;i++){p=beginProjectExam(p,exam,1000+i*60000);p.activeExam.userAnswers={1:'A'};p=submitProjectExam(p,1100+i*60000);}
 p.activeExam.practiceMode='focused';
 const prompt=buildGenerationPrompt(p);
 for(const s of ['recipe marker','context marker','source marker','objective marker','DEMO.1#1','Combine small sets.','PREVIOUS PRACTICE ITEMS','demo-item-1']) assert.ok(prompt.includes(s),s);
 assert.ok(externalPacket(p).includes(prompt));
 assert.equal(totalAnsweredQuestions(p.examHistory),5);
 assert.equal(buildPracticeModeContext(p.examHistory).loStats[0].totalAttempts,5);
 assert.equal(buildPracticeModeContext(p.examHistory).loStats[0].weak,true);
 assert.ok(!externalPacket(p,false).includes('source marker'));
 p.activeExam.selectedSectionIds=[];assert.throws(()=>buildGenerationPrompt(p),/Select at least/);
});
test('invalid import and foreign registry do not mutate the project',()=>{
 const p=project(),before=JSON.stringify(p),f=fixture();f.questions[0].metadata.objectiveIds=['unknown'];
 assert.throws(()=>parseProjectExam(f,p.registry),/objective/i);assert.equal(JSON.stringify(p),before);
 const foreign=fixture();foreign.registry.id='foreign';assert.throws(()=>parseProjectExam(foreign,p.registry),/different objective registry/);
});
test('generated citations tolerate malformed optional entries without weakening clinical or registry checks',()=>{
 const p=project(), f=fixture();
 const rows:any=structuredClone(f.questions);
 rows[0].metadata.sources=[{title:'Valid source',page:12},{title:'Bad page',page:0},{title:'Bad URL',url:'javascript:alert(1)'},null];
 const before=JSON.stringify(rows);
 const validated=validateGeneratedQuestions(rows,p.registry);
 assert.deepEqual(validated[0].metadata.sources,[{title:'Valid source',page:12}]);
 assert.equal(JSON.stringify(rows),before);
 assert.throws(()=>parseProjectExam({questions:rows},p.registry),/Source page/);
 delete rows[0].metadata.topicId;
 assert.throws(()=>validateGeneratedQuestions(rows,p.registry),/topic\/bucket/);
 rows[0].metadata.topicId=f.questions[0].metadata.topicId;
 rows[0].correctAnswer='E';
 assert.throws(()=>validateGeneratedQuestions(rows,p.registry),/answer key/);
 rows[0].correctAnswer=f.questions[0].correctAnswer;
 rows[0].options.D=rows[0].options.A;
 assert.throws(()=>validateGeneratedQuestions(rows,p.registry),/duplicate options/);
});
test('generated numbering and case labels cannot discard a valid set or combine distinct cases',()=>{
 const p=project(),rows:any=structuredClone(fixture().questions);
 rows.forEach(q=>{q.id=1;q.metadata.itemId='duplicate invalid / ID';});
 rows[0].metadata.caseId='Case A';rows[1].metadata.caseId='Case A';rows[2].metadata.caseId='Case-A';
 const before=JSON.stringify(rows),questions=validateGeneratedQuestions(rows,p.registry);
 assert.deepEqual(questions.map(q=>q.id),[1,2,3]);
 assert.ok(questions.every(q=>q.metadata.itemId===undefined));
 assert.deepEqual(questions.map(q=>q.metadata.caseId),['case-1','case-1','case-2']);
 assert.equal(JSON.stringify(rows),before);
 assert.throws(()=>parseProjectExam({questions:rows},p.registry),/Item ID/);
});
test('import, timer, answers, submit, next exam and clean share preserve independent history',()=>{
 let p=project();const exam=parseProjectExam(fixture(),p.registry);p=addExam(p,exam);
 assert.equal(addExam(p,exam).savedExams?.length,1);
 p=beginProjectExam(p,exam,1000);p.activeExam.userAnswers={1:'B',2:'A'};p.activeExam.flaggedQuestions=[2];
 assert.throws(()=>beginProjectExam(p,exam),/Finish/);
 p=submitProjectExam(p,2000);assert.equal(p.examHistory[0].score,1);assert.equal(totalAnsweredQuestions(p.examHistory),2);
 assert.deepEqual(p.examHistory[0].flaggedQuestions,[2]);assert.equal(submitProjectExam(p,2500).examHistory.length,1);
 const shared=projectShare(p),text=JSON.stringify(shared);
 for(const field of ['userAnswers','examHistory','startedAt','flaggedQuestions','userId'])assert.ok(!text.includes(`"${field}"`));
 const friend=importProject(shared,'friend','local');assert.equal(friend.examHistory.length,0);assert.equal(friend.savedExams?.length,1);assert.equal(friend.questionWritingInstructions,p.questionWritingInstructions);assert.deepEqual(friend.styleExamples,p.styleExamples);
 assert.equal(beginProjectExam(p,exam,3000).examHistory.length,1);
});
test('standalone practice backup merges once with flags and answers; active deadlines survive',()=>{
 let p=project();let state=startAttempt(emptyState(),parseExam(fixture()),'attempt-standalone',Date.now()-10000);
 state=recordAnswer(state,1,'B',Date.now()-5000);state.active!.flags=[1];state=finishAttempt(state,Date.now()-2000,'submitted');
 p=mergePracticeBackup(p,backup(state));assert.equal(p.examHistory.length,1);assert.equal(p.examHistory[0].score,1);assert.deepEqual(p.examHistory[0].flaggedQuestions,[1]);
 assert.equal(mergePracticeBackup(p,backup(state)).examHistory.length,1);
 const restored=importProject({format:'medexam-project-backup',project:p},'owner','local');assert.equal(restored.examHistory.length,1);assert.notEqual(restored.id,p.id);
});
test('legacy project and legacy question arrays keep working without an objective registry',()=>{
 const old=importProject({name:'Old project',description:'Legacy',blueprint:[{id:'1',title:'Week 1',questionCount:'10',files:[]}],examHistory:[{user:'must not copy'}]},'u','cloud');
 assert.equal(old.examHistory.length,0);assert.deepEqual(old.activeExam,emptyExam());
 const f=fixture();const rows=f.questions.map(({metadata,...q})=>({...q,metadata:{week:1,cluster:'Old',subtype:'diagnosis',cognitiveLevel:'1.2',losTested:['Free text']}}));
 const exam=parseProjectExam(rows);assert.equal(exam.questions.length,3);assert.ok(exam.questions[0].metadata.itemId);
});
test('source scope selects the actual topic file and does not silently truncate sources',()=>{
 const p=project();assert.equal(questionSources(p,parseProjectExam(fixture()).questions[0])[0].name,'Synthetic fixture');
 p.blueprint[0].files[0].content='x'.repeat(920000);assert.throws(()=>buildGenerationPrompt(p),/too large/);
});
test('imported numbering normalizes safely and duplicate answer options are rejected',()=>{
 const f=fixture();f.questions.forEach((q,i)=>q.id=100+i);
 assert.deepEqual(parseProjectExam(f).questions.map(q=>q.id),[1,2,3]);
 const invalid=fixture();invalid.questions[0].options.D=invalid.questions[0].options.A;
 assert.throws(()=>parseProjectExam(invalid),/duplicate options/);
});

test('a local-marked shared project cannot silently upload through a cloud import',()=>{
 const shared=projectShare(project());assert.throws(()=>importProject(shared,'cloud-user','cloud'),/Confirm saving/);
 const cloud=importProject(shared,'cloud-user','cloud',true);
 assert.equal(cloud.storageMode,'cloud');assert.equal(cloud.userId,'cloud-user');assert.equal(allowsOnlineAI(cloud),false);
 assert.deepEqual(cloud.blueprint,project().blueprint);assert.deepEqual(cloud.registry,project().registry);
});
test('account copy preserves the full study project and active timer with stable owner-scoped identity',async()=>{
 let p=project();const exam=parseProjectExam(fixture(),p.registry);p=addExam(p,exam);
 p=beginProjectExam(p,exam,1000);p.activeExam.userAnswers={1:'B'};p.activeExam.flaggedQuestions=[1];p=submitProjectExam(p,2000);
 p=beginProjectExam(p,exam,3000);p.activeExam.userAnswers={2:'A'};p.activeExam.flaggedQuestions=[2];
 const before=structuredClone(p),cloud=await accountCopy(p,'owner');
 assert.deepEqual(p,before);assert.notEqual(cloud.id,p.id);assert.equal(cloud.storageMode,'cloud');assert.equal(cloud.userId,'owner');
 for(const field of ['activeExam','examHistory','savedExams','blueprint','registry','styleExamples','learningObjectivesFiles','questionWritingInstructions'] as const)assert.deepEqual(cloud[field],p[field]);
 assert.equal(cloud.id,(await accountCopy(p,'owner')).id);assert.notEqual(cloud.id,(await accountCopy(p,'friend')).id);
 assert.equal(allowsOnlineAI(cloud),false);assert.equal(cloud.cloudSyncedAt,undefined);
 await assert.rejects(()=>accountCopy(p,'local'),/Sign in/);await assert.rejects(()=>accountCopy(cloud,'owner'),/already/);
});
test('cloud backup approval covers archived attempts and never silently enables Gemini',()=>{
 const p=project(),exam=parseProjectExam(fixture(),p.registry);
 p.archivedExams=[beginProjectExam(p,exam,1000).activeExam];
 const restored=importProject({format:'medexam-project-backup',project:p},'owner','cloud',true);
 assert.equal(restored.archivedExams?.[0].endsAt,p.archivedExams[0].endsAt);assert.equal(allowsOnlineAI(restored),false);
 assert.equal(allowsOnlineAI({...restored,allowOnlineAI:true}),true);
 assert.equal(allowsOnlineAI({...restored,allowOnlineAI:undefined}),true);
 assert.equal(allowsOnlineAI({...p,allowOnlineAI:undefined}),false);
});
test('large histories use compact scoped avoidance without dropping ID-based evidence',()=>{
 const p=project();p.activeExam.questionCount=20;
 const questions=Array.from({length:500},(_,i)=>({...parseProjectExam(fixture()).questions[0],id:i+1,vignette:'synthetic '.repeat(300),metadata:{...parseProjectExam(fixture()).questions[0].metadata,itemId:`history-${i}`}}));
 p.examHistory=[{id:'long-history',date:new Date().toISOString(),score:500,totalQuestions:500,questions,answers:Object.fromEntries(questions.map(q=>[q.id,'B']))}];
 const prompt=buildGenerationPrompt(p);assert.ok(prompt.length<300000);assert.ok(prompt.includes('history-499'));assert.ok(prompt.includes('"answered":500'));
});

test('backup restores old unmapped banks after the project adopts an objective registry',()=>{
 const p=project();const rows=fixture().questions.map(({metadata,...q})=>({...q,metadata:{week:1,cluster:'Old',subtype:'diagnosis',cognitiveLevel:'1.2',losTested:['Free text']}}));
 p.savedExams=[parseProjectExam(rows)];
 const restored=importProject({format:'medexam-project-backup',project:p},'local','local');
 assert.equal(restored.savedExams?.[0].questions.length,3);
 assert.throws(()=>parseProjectExam(rows,p.registry),/registry/);
});
