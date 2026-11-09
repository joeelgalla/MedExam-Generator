import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import type {ExamQuestion} from '../types.ts';
import {buildReportRow,reportItemId,MAX_REPORT_COMMENT} from '../services/questionReports.ts';

const question=(itemId?:string)=>({id:3,vignette:'v'.repeat(400),leadIn:'Which next step?',options:{A:'1',B:'2',C:'3',D:'4'},correctAnswer:'C',explanation:'',metadata:{itemId,losTested:[],cluster:''}}) as unknown as ExamQuestion;

test('a report row keeps the context needed to review the question',()=>{
  const row=buildReportRow('project-1',{question:question('item-9'),where:'results',selectedOption:'B',attemptId:'attempt-1',examId:'exam-1',examTitle:'Synthetic set'},'  key looks wrong  ');
  assert.equal(row.item_id,'exam-1:item-9');
  assert.equal(row.comment,'key looks wrong');
  assert.equal(row.selected_option,'B');
  assert.equal(row.exam_title,'Synthetic set');
  assert.equal(row.attempt_id,'attempt-1');
  assert.equal(row.question_id,3);
  assert.deepEqual(row.question_snapshot,{leadIn:'Which next step?',vignetteStart:'v'.repeat(300),correctAnswer:'C'});
  assert.equal(buildReportRow('p',{question:question('x'),where:'progress',selectedOption:null,attemptId:null,examId:null,examTitle:null},'c'.repeat(5000)).comment.length,MAX_REPORT_COMMENT);
  assert.equal(reportItemId(question(),'exam-1'),'exam-1:3','questions without an item ID are keyed by exam and number');
});

test('the report button appears only for signed-in projects, beside the review controls and Flag',async()=>{
  const bundle=await build({stdin:{contents:`
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import QuestionCard from './components/QuestionCard';
    import {QuestionReportProvider} from './components/QuestionReports';
    import {importProject,emptyExam} from './services/projectWorkflow';
    import {fixture} from './tests/fixtures';
    const p=importProject({name:'Synthetic reports',blueprint:[],referenceTotalQuestions:40,learningObjectivesFiles:[]},'local','local');
    const q=fixture().questions[0];
    p.activeExam={...emptyExam(),questions:fixture().questions,userAnswers:{1:'B'},status:'completed',examId:'demo-01',attemptId:'a1'};
    const store={load:async()=>[],save:async(r)=>r,remove:async()=>{}};
    const props={question:q,index:0,selectedOption:'B',isFlagged:false,onSelectOption:()=>{},onToggleFlag:()=>{},onDeepDive:async()=>'',onChatSend:async()=>''};
    export const signedIn=renderToStaticMarkup(<QuestionReportProvider project={p} store={store}><QuestionCard {...props} isSubmitted /></QuestionReportProvider>);
    export const during=renderToStaticMarkup(<QuestionReportProvider project={p} store={store}><QuestionCard {...props} isSubmitted={false} /></QuestionReportProvider>);
    export const standalone=renderToStaticMarkup(<QuestionCard {...props} isSubmitted privatePractice />);
  `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
  const module={exports:{} as Record<string,string>};
  new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const {signedIn,during,standalone}=module.exports;
  assert.match(signedIn,/Report a problem/);
  assert.match(signedIn,/Ask the AI Tutor/);
  assert.doesNotMatch(signedIn,/What looks wrong/,'the comment box stays closed until asked for');
  assert.match(during,/>Report<\/button>/,'a quiet Report button sits beside Flag during the exam');
  assert.match(during,/Flag<\/button>/);
  assert.doesNotMatch(during,/What looks wrong/);
  assert.doesNotMatch(standalone,/Report a problem/,'no account, no report button');
});
