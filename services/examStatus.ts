import type {ExamAttempt,Project} from '../types';

type ExamSource=Pick<Project,'examHistory'|'savedExams'|'activeExam'>;

const itemIds=(questions:{metadata?:{itemId?:string}}[])=>new Set(questions.map(q=>q.metadata?.itemId).filter((id):id is string=>Boolean(id)));

// Completed attempts do not record which saved exam they came from, so link
// them by question IDs. An attempt belongs to an exam only when the two hold
// mostly the same questions: at least 80% of the attempt and half of the exam.
// Sets that share a few reused bank questions are not linked, and ties stay
// unlinked rather than guessed. The active exam's own attempt ID wins outright.
export function linkAttemptsToExams(project:ExamSource):Map<string,string> {
  const exams=(project.savedExams||[]).map(e=>({examId:e.examId,items:itemIds(e.questions)})).filter(e=>e.items.size>0);
  const {attemptId:activeAttemptId,examId:activeExamId}=project.activeExam;
  const links=new Map<string,string>();
  for(const attempt of project.examHistory){
    if(activeAttemptId===attempt.id&&activeExamId&&exams.some(e=>e.examId===activeExamId)){links.set(attempt.id,activeExamId);continue;}
    const items=itemIds(attempt.questions);
    let best='',bestScore=0,tied=false;
    for(const exam of exams){
      let shared=0;
      for(const id of items)if(exam.items.has(id))shared++;
      if(!shared||shared<0.8*items.size||shared<0.5*exam.items.size)continue;
      const score=shared/(items.size+exam.items.size-shared);
      if(score>bestScore){best=exam.examId;bestScore=score;tied=false;}
      else if(score===bestScore)tied=true;
    }
    if(best&&!tied)links.set(attempt.id,best);
  }
  return links;
}

// The most recent linked attempt for each saved exam, in history order.
export function latestAttemptByExam(project:ExamSource,links=linkAttemptsToExams(project)):Map<string,ExamAttempt> {
  const latest=new Map<string,ExamAttempt>();
  for(const attempt of project.examHistory){
    const examId=links.get(attempt.id);
    if(examId)latest.set(examId,attempt);
  }
  return latest;
}

type Snapshot={vignette?:string;leadIn?:string;options?:Record<string,string>;correctAnswer?:string;metadata?:{itemId?:string}};
const questionSignature=(q:Snapshot)=>JSON.stringify([q.vignette||'',q.leadIn||'',['A','B','C','D'].map(k=>q.options?.[k]||''),q.correctAnswer||'']);

// How many of a set's questions are new, or have a different stem, lead-in,
// options or key from the copy saved with the attempt. Explanation-only edits
// do not count. Item IDs survive rewrites, so matching alone cannot tell.
export function changedSinceAttempt(examQuestions:Snapshot[],attemptQuestions:Snapshot[]):number {
  const taken=new Map(attemptQuestions.map(q=>[q.metadata?.itemId,questionSignature(q)]));
  return examQuestions.filter(q=>{const before=q.metadata?.itemId?taken.get(q.metadata.itemId):undefined;return before===undefined||before!==questionSignature(q);}).length;
}
