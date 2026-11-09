import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import type {ExamAttempt,ExamQuestion,SavedExam} from '../types.ts';
import {linkAttemptsToExams,latestAttemptByExam} from '../services/examStatus.ts';

// Synthetic IDs only. The shapes mirror a bank where later sets reuse
// questions from earlier ones.
type Source=Parameters<typeof linkAttemptsToExams>[0];
const ids=(prefix:string,n:number)=>Array.from({length:n},(_,i)=>`${prefix}${i+1}`);
const questions=(itemIds:string[])=>itemIds.map((itemId,i)=>({id:i+1,metadata:{itemId}})) as unknown as ExamQuestion[];
const exam=(examId:string,itemIds:string[])=>({format:'medexam-exam',version:1,examId,title:`Synthetic ${examId}`,durationMinutes:10,instructions:'',questions:questions(itemIds)}) as SavedExam;
const attempt=(id:string,itemIds:string[],score=0)=>({id,date:'2026-01-01T12:00:00Z',score,totalQuestions:itemIds.length,answers:{},questions:questions(itemIds)}) as ExamAttempt;
const source=(savedExams:SavedExam[],examHistory:ExamAttempt[],activeExam:Record<string,unknown>={})=>({savedExams,examHistory,activeExam:{questions:[],userAnswers:{},flaggedQuestions:[],status:'completed',...activeExam}}) as unknown as Source;

test('attempts link to the set they took, not to sets that only share reused questions',()=>{
  const mixed=[...ids('b',7),...ids('c',17)];
  const s=source([exam('A',ids('a',20)),exam('B',ids('b',20)),exam('T',[...ids('t',8),'t-added']),exam('S',ids('s',7)),exam('M',mixed)],
    [attempt('whole',ids('a',20),18),attempt('small',ids('s',7),6),attempt('before-edit',ids('t',8),5),attempt('mixed',mixed,20)]);
  const links=linkAttemptsToExams(s);
  assert.equal(links.get('whole'),'A');
  assert.equal(links.get('small'),'S');
  assert.equal(links.get('before-edit'),'T',"a set that gained a question after the attempt still counts as taken");
  assert.equal(links.get('mixed'),'M');
  assert.ok(![...links.values()].includes('B'),'sharing 7 reused questions does not mark a 20-question set as taken');
});

test('ties, weak overlaps and unrelated attempts stay unlinked',()=>{
  const s=source([exam('X',ids('x',10)),exam('Y',ids('x',10)),exam('Z',ids('z',20))],
    [attempt('tie',ids('x',10)),attempt('weak',[...ids('z',5),...ids('w',15)]),attempt('unrelated',ids('q',5)),attempt('no-ids',[])]);
  assert.equal(linkAttemptsToExams(s).size,0);
});

test('the active exam names its own attempt, and the latest attempt per set wins',()=>{
  const s=source([exam('A',ids('a',4)),exam('B',ids('b',4))],[attempt('first',ids('a',4),1),attempt('second',ids('a',4),3),attempt('current',[],2)],{attemptId:'current',examId:'B'});
  const links=linkAttemptsToExams(s);
  assert.equal(links.get('current'),'B');
  const latest=latestAttemptByExam(s,links);
  assert.equal(latest.get('A')?.id,'second');
  assert.equal(latest.get('B')?.id,'current');
});

test('exam cards show which sets are done and previous attempts name their set',async()=>{
  const bundle=await build({stdin:{contents:`
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import ProjectExamTools from './components/ProjectExamTools';
    import {importProject,emptyExam} from './services/projectWorkflow';
    const q=(ids)=>ids.map((itemId,i)=>({id:i+1,vignette:'',leadIn:'',options:{A:'1',B:'2',C:'3',D:'4'},correctAnswer:'A',explanation:'',metadata:{itemId,losTested:[],cluster:''}}));
    const exam=(examId,title,ids)=>({format:'medexam-exam',version:1,examId,title,durationMinutes:6,instructions:'',questions:q(ids)});
    const p=importProject({name:'Synthetic status',blueprint:[],referenceTotalQuestions:40,learningObjectivesFiles:[]},'local','local');
    p.savedExams=[exam('done','Synthetic finished set',['a1','a2','a3','a4']),exam('open','Synthetic open set',['b1','b2','b3','a1']),exam('fresh','Synthetic untouched set',['c1','c2'])];
    p.examHistory=[{id:'att',date:'2026-01-01T12:00:00Z',score:3,totalQuestions:4,answers:{},questions:q(['a1','a2','a3','a4'])}];
    p.archivedExams=[{...emptyExam(),examId:'open',title:'Synthetic open set',questions:q(['b1','b2','b3','a1']),userAnswers:{1:'A',2:'B'},status:'active'}];
    const props={onUpdate:()=>{},onStart:()=>{},onError:()=>{},onGenerate:()=>{},onResume:()=>{},onMaterials:()=>{},onProgress:()=>{},onActionConsumed:()=>{},disabled:false};
    export const html=renderToStaticMarkup(<ProjectExamTools {...props} project={p}/>);
  `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
  const module={exports:{} as Record<string,string>};
  new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const html=module.exports.html.replace(/<!-- -->/g,'');
  const card=(title:string)=>(html.split('<article').find(part=>part.includes(title))||'').split('</article>')[0];
  assert.match(html,/1 of 3 done/);
  assert.match(card('Synthetic finished set'),/Done · 3\/4/);
  assert.match(card('Synthetic finished set'),/Retake exam/);
  assert.match(card('Synthetic finished set'),/action-secondary/);
  assert.doesNotMatch(card('Synthetic finished set'),/seen before|not yet seen/);
  assert.match(card('Synthetic open set'),/Unfinished · 2 answered/);
  assert.match(card('Synthetic open set'),/1 seen before/);
  assert.match(card('Synthetic open set'),/Start exam/);
  assert.doesNotMatch(card('Synthetic open set'),/Done ·|Retake/);
  assert.match(card('Synthetic untouched set'),/Start exam/);
  assert.doesNotMatch(card('Synthetic untouched set'),/Done ·|seen before|Unfinished|Retake/);
  const attempts=html.slice(html.indexOf('Previous attempts'));
  assert.match(attempts,/Synthetic finished set/);
  assert.match(attempts,/3\/4 correct/);
});
