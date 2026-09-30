import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

test('legacy cloud cards retain tutor controls; private cards hide hints and escape markup', async () => {
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import QuestionCard from './components/QuestionCard';
    const q = {id:1,vignette:'<img src=x onerror=alert(1)>',leadIn:'Choose an option',options:{A:'One',B:'Two',C:'Three',D:'Four'},correctAnswer:'A',explanation:'A synthetic explanation',metadata:{losTested:['Synthetic objective'],cluster:'Synthetic cluster',week:5,subtype:'diagnosis',cognitiveLevel:'1.2'}};
    const props={question:q,index:0,selectedOption:null,isFlagged:false,onSelectOption:()=>{},onToggleFlag:()=>{},onDeepDive:async()=>'',onChatSend:async()=>''};
    export const cloud=renderToStaticMarkup(<QuestionCard {...props} isSubmitted />);
    export const active=renderToStaticMarkup(<QuestionCard {...props} isSubmitted={false} privatePractice />);
    export const review=renderToStaticMarkup(<QuestionCard {...props} isSubmitted privatePractice />);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external' });
  const module = { exports: {} as Record<string, string> };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const { cloud, active, review } = module.exports;
  assert.match(cloud, /Find supporting passages/);
  assert.match(cloud, /Ask the AI Tutor/);
  assert.match(cloud, /Week/);
  assert.doesNotMatch(active, /Synthetic cluster|Synthetic objective|A synthetic explanation|Find supporting passages/);
  assert.match(review, /A synthetic explanation/);
  assert.match(review, /Unanswered/);
  assert.doesNotMatch(review, /Find supporting passages|AI Tutor/);
  for (const html of [cloud, active, review]) {
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img/);
  }
});

test('every API handler returns before model access on a preview deployment', async () => {
  const original = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    for (const route of ['generate', 'analyze', 'ocr', 'chat']) {
      const bundle = await build({ entryPoints: [`api/${route}.ts`], bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external' });
      const module = { exports: {} as { default: (req: unknown, res: unknown) => Promise<unknown> } };
      new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
      let status = 0, body: any;
      const res = { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } };
      await module.exports.default({ method: 'POST', body: {} }, res);
      assert.equal(status, 503, route);
      assert.match(body.error, /disabled/, route);
    }
  } finally { if (original === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = original; }
});

test('an all-skipped submitted exam still exposes history and review without false accuracy',async()=>{
 const bundle=await build({stdin:{contents:`
  import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
  import AnalyticsDashboard from './components/AnalyticsDashboard';
  import {fixture} from './tests/fixtures';
  export const html=renderToStaticMarkup(<AnalyticsDashboard history={[{id:'skipped',date:'2026-01-01',score:0,totalQuestions:3,answers:{},questions:fixture().questions}]} onDeepDive={async()=>''} onChatSend={async()=>''}/>);
 `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
 const module={exports:{} as {html:string}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 assert.match(module.exports.html,/Review Questions/);assert.doesNotMatch(module.exports.html,/NaN|No Exams Yet/);
});


test('legacy, new and bank projects expose the same generation and import paths while keeping old attempts visible',async()=>{
 const bundle=await build({stdin:{contents:`
  import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
  import ProjectExamTools from './components/ProjectExamTools';
  import {importProject,emptyExam,parseProjectExam} from './services/projectWorkflow';
  import {fixture} from './tests/fixtures';
  const p=importProject({name:'Synthetic legacy',blueprint:[],referenceTotalQuestions:40,learningObjectivesFiles:[]},'local','local');
  const props={onUpdate:()=>{},onStart:()=>{},onError:()=>{},onGenerate:()=>{},onResume:()=>{},onMaterials:()=>{},onProgress:()=>{},onActionConsumed:()=>{},disabled:false};
  export const fresh=renderToStaticMarkup(<ProjectExamTools {...props} project={p}/>);
  p.examHistory=[{id:'previous',date:'2026-01-01',score:1,totalQuestions:3,answers:{1:'B'},questions:fixture().questions}];
  p.activeExam={...emptyExam(),questions:fixture().questions,userAnswers:{1:'B'},status:'active'};
  export const legacy=renderToStaticMarkup(<ProjectExamTools {...props} project={p}/>);
  p.savedExams=[parseProjectExam(fixture())];
  export const bank=renderToStaticMarkup(<ProjectExamTools {...props} project={p}/>);
 `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
 const module={exports:{} as Record<string,string>};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 for(const html of Object.values(module.exports)){assert.match(html,/Generate an exam/);assert.match(html,/Import an exam/);assert.match(html,/Share project/);}
 assert.match(module.exports.legacy,/Previous attempts/);assert.match(module.exports.legacy,/Continue exam/);assert.doesNotMatch(module.exports.legacy,/Your next exam starts here/);
 assert.match(module.exports.fresh,/Your next exam starts here/);
});
