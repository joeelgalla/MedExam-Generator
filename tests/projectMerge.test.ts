import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeProjectCopies} from '../services/projectMerge.ts';
import {importProject,parseProjectExam,addExam,beginProjectExam,submitProjectExam} from '../services/projectWorkflow.ts';
import {fixture} from './fixtures.ts';
const base=()=>importProject({name:'Cross-device synthetic',blueprint:[{id:'basics',title:'Foundations',questionCount:'3',files:[]}],learningObjectivesFiles:[],referenceTotalQuestions:3},'same-owner','cloud');
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
