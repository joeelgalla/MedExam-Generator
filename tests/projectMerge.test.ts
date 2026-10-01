import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeProjectCopies} from '../services/projectMerge.ts';
import {importProject,parseProjectExam,addExam,beginProjectExam,submitProjectExam,projectShare} from '../services/projectWorkflow.ts';
import {fixture} from './fixtures.ts';
const base=()=>importProject({name:'Cross-device synthetic',blueprint:[{id:'basics',title:'Foundations',questionCount:'3',files:[]}],learningObjectivesFiles:[],referenceTotalQuestions:3},'same-owner','cloud');

test('a withdrawn accidental submission cannot return or stop a recovered attempt after stale sync',()=>{
 const e=parseProjectExam(fixture());
 const running=beginProjectExam(addExam(base(),e),e,100000);
 running.activeExam.userAnswers={1:'B'};running.activeExam.flaggedQuestions=[1];
 const forced=submitProjectExam(running,160000), originalId=forced.examHistory[0].id;
 const recovered=structuredClone(forced);
 recovered.voidedAttemptIds=[originalId];recovered.examHistory=[];
 recovered.activeExam={...recovered.activeExam,status:'active',attemptId:'reopened',recoveredFromAttemptId:originalId,startedAt:undefined,endsAt:undefined};
 forced.lastModified='2026-10-01T23:59:00Z';recovered.lastModified='2026-10-01T23:50:00Z';
 for(const stale of [forced,running]) for(const [a,b] of [[stale,recovered],[recovered,stale]]) {
  const merged=mergeProjectCopies(a,b);
  assert.equal(merged.examHistory.length,0);
  assert.equal(merged.activeExam.attemptId,'reopened');
  assert.equal(merged.activeExam.status,'active');
  assert.deepEqual(merged.activeExam.userAnswers,{1:'B'});
  assert.deepEqual(merged.activeExam.flaggedQuestions,[1]);
  assert.deepEqual(merged.voidedAttemptIds,[originalId]);
 }
 const done=submitProjectExam(recovered,180000);
 const merged=mergeProjectCopies(forced,done);
 assert.equal(merged.examHistory.length,1);assert.equal(merged.examHistory[0].id,'reopened');
 assert.equal(merged.activeExam.attemptId,'reopened');assert.equal(merged.activeExam.status,'completed');
 const restored=importProject({format:'medexam-project-backup',project:recovered},'same-owner','local');
 assert.deepEqual(restored.voidedAttemptIds,[originalId]);assert.equal(restored.activeExam.recoveredFromAttemptId,originalId);
 assert.ok(!JSON.stringify(projectShare(recovered)).includes(originalId));
});
function complete(p:ReturnType<typeof base>,id:string){const e=parseProjectExam({...fixture(),examId:id});const next=beginProjectExam(addExam(p,e),e,1000);next.activeExam.userAnswers={1:'B'};return submitProjectExam(next,2000);}
test('a later edit on a stale device preserves exams and attempts from both devices',()=>{
 const p=base(),a=complete(structuredClone(p),'exam-a'),b=complete(structuredClone(p),'exam-b');
 a.lastModified='2026-09-27T10:00:00Z';b.lastModified='2026-09-27T11:00:00Z';b.description='later edit';
 const merged=mergeProjectCopies(b,a);assert.equal(merged.examHistory.length,2);assert.equal(merged.savedExams?.length,2);assert.equal(merged.description,'later edit');
 assert.equal(mergeProjectCopies(merged,a).examHistory.length,2);
});
test('conflicting same-ID attempts cannot silently overwrite each other',()=>{
 const a=complete(base(),'exam-a'),b=structuredClone(a);b.examHistory[0].answers={1:'A'};assert.throws(()=>mergeProjectCopies(b,a),/Conflicting attempt/);
});
test('bank revisions win in either sync direction without changing completed or running attempts',()=>{
 const finished=complete(base(),'exam-a'),revised=structuredClone(finished);
 revised.savedExams![0]={...revised.savedExams![0],title:'Exam 1',contentRevision:2,questions:revised.savedExams![0].questions.map(q=>({...q,options:{...q.options,A:'Revised distractor'}}))};
 // An old device can have a newer settings timestamp. It still cannot downgrade the bank.
 finished.lastModified='2026-09-27T23:00:00Z';revised.lastModified='2026-09-27T22:00:00Z';
 for(const [a,b] of [[finished,revised],[revised,finished]]) {
  const merged=mergeProjectCopies(a,b);
  assert.equal(merged.savedExams![0].title,'Exam 1');
  assert.deepEqual(merged.examHistory,finished.examHistory);
  assert.deepEqual(merged.activeExam,finished.activeExam);
 }
 const running=beginProjectExam(base(),finished.savedExams![0],5000);
 running.savedExams=finished.savedExams;
 const newer=structuredClone(running);newer.savedExams=revised.savedExams;
 assert.deepEqual(mergeProjectCopies(running,newer).activeExam,running.activeExam);
});
test('different content with the same bank revision still raises a conflict',()=>{
 const a=complete(base(),'exam-a'),b=structuredClone(a);
 b.savedExams![0].title='Unversioned conflicting edit';
 assert.throws(()=>mergeProjectCopies(a,b),/Conflicting exam/);
});
test('an older active copy cannot revive a completed attempt',()=>{
 const p=base(),e=parseProjectExam(fixture());const active=beginProjectExam(addExam(p,e),e,1000),finished=submitProjectExam(active,2000);
 active.lastModified='2026-09-27T12:00:00Z';finished.lastModified='2026-09-27T11:00:00Z';
 const merged=mergeProjectCopies(active,finished);assert.equal(merged.activeExam.status,'completed');assert.equal(merged.examHistory.length,1);
});

test('active answers merge against the last synced baseline and reject competing changes',()=>{
 const p=base(),e=parseProjectExam(fixture());const original=beginProjectExam(addExam(p,e),e,1000);
 original.activeExam.userAnswers={1:'A'};
 const a=structuredClone(original),b=structuredClone(original);
 a.activeExam.userAnswers={1:'B'};b.activeExam.userAnswers={1:'A',2:'C'};
 assert.deepEqual(mergeProjectCopies(a,b,original).activeExam.userAnswers,{1:'B',2:'C'});
 b.activeExam.userAnswers[1]='D';assert.throws(()=>mergeProjectCopies(a,b,original),/same answer/);
 assert.throws(()=>mergeProjectCopies(a,b),/same answer/);
});
test('a resumed or completed draft is not resurrected by an old cloud copy',()=>{
 const p=base(),e=parseProjectExam(fixture());const active=beginProjectExam(addExam(p,e),e,1000);
 const old=structuredClone(active);old.archivedExams=[old.activeExam];old.activeExam={...old.activeExam,questions:[],userAnswers:{}};
 assert.equal(mergeProjectCopies(active,old).archivedExams?.length,0);
 const completed=submitProjectExam(active,2000);
 assert.equal(mergeProjectCopies(completed,old).archivedExams?.length,0);
});

test('a newer settings-only copy cannot discard an older unfinished exam',()=>{
 const p=base(),e=parseProjectExam(fixture());const running=beginProjectExam(addExam(p,e),e,1000);
 running.activeExam.userAnswers={1:'B'};running.lastModified='2026-09-27T10:00:00Z';
 const idle=structuredClone(p);idle.lastModified='2026-09-27T11:00:00Z';idle.description='New settings';
 const merged=mergeProjectCopies(running,idle);
 assert.deepEqual(merged.activeExam.userAnswers,{1:'B'});assert.equal(merged.activeExam.attemptId,running.activeExam.attemptId);assert.equal(merged.description,'New settings');
 assert.equal(mergeProjectCopies(idle,running).activeExam.attemptId,running.activeExam.attemptId);
 const aside=structuredClone(idle);aside.archivedExams=[running.activeExam];
 assert.equal(mergeProjectCopies(running,aside).activeExam.questions.length,0);assert.equal(mergeProjectCopies(running,aside).archivedExams?.length,1);
});


test('an answer save from an older tab retains repaired remote instructions and exam references',()=>{
 const baseline=base(),local=structuredClone(baseline),remote=structuredClone(baseline);
 local.lastModified='2026-10-01T23:00:00Z';remote.lastModified='2026-10-01T22:00:00Z';
 remote.questionWritingInstructions='Use actual exam task demands';remote.examReferenceFiles=[{id:'synthetic',type:'txt',size:100,name:'Synthetic example',content:'A synthetic scenario',topicIds:['one']}];remote.sourcePolicy='course-first';
 const merged=mergeProjectCopies(local,remote,baseline);
 assert.equal(merged.questionWritingInstructions,remote.questionWritingInstructions);
 assert.deepEqual(merged.examReferenceFiles,remote.examReferenceFiles);
 assert.equal(merged.sourcePolicy,'course-first');
});


test('withdrawn banks stay withdrawn after stale sync, retain attempts and are omitted from friend shares',()=>{
 const old=complete(base(),'withdrawn-bank'),revised=structuredClone(old);
 revised.savedExams![0]={...revised.savedExams![0],contentRevision:2,retired:true};
 old.lastModified='2026-10-01T23:00:00Z';revised.lastModified='2026-10-01T22:00:00Z';
 const merged=mergeProjectCopies(old,revised);
 assert.equal(merged.savedExams![0].retired,true);assert.deepEqual(merged.examHistory,old.examHistory);
 assert.equal(projectShare(merged).savedExams.length,0);
 const restored=importProject({format:'medexam-project-backup',project:merged},'same-owner','local');
 assert.equal(restored.savedExams![0].retired,true);assert.equal(restored.examHistory.length,1);
});
