import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fixture} from './fixtures.ts';
import {parseProjectExam} from '../services/projectWorkflow.ts';

async function verifier() {
 const result=await build({entryPoints:['lib/server/generationVerifier.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
 const module={exports:{} as any};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 return module.exports;
}
const quote='Adding red and blue counters gives the total number of counters.';
const files=[{id:'source',name:'Synthetic fixture',content:'[Original handbook PDF page 7]\n'+quote,type:'txt',size:100}];
const check=(q:any)=>({id:q.id,answerText:q.options[q.correctAnswer],objectiveFits:true,recheckFits:true,homogeneousOptions:true,difficulty:'appropriate',reasoning:'Add the two sets to obtain the total.',optionFeedback:Object.values(q.options).map(n=>({optionText:n,plausibleAlternative:true,whenAppropriate:'The total would be correct if the groups contained different counts.',reason:`The proposed count is ${n}. Hepatitis B is a medical name, not an option label.`})),criteriaChecks:[{claim:'Combine both groups to find the total.',title:'Synthetic fixture',sourceQuote:quote,satisfied:true}],evidence:[{title:files[0].name,quote}]});
test('blind checking hides keys and rationales, rejects disagreement and ambiguous answers, and binds feedback during key balancing',async()=>{
 const {verifyDraft}=await verifier();const qs=parseProjectExam(fixture()).questions;
 qs[0].explanation='WRITER_KEY_DO_NOT_EXPOSE';
 const requests:any[]=[];const ai={models:{generateContent:async(r:any)=>{
  requests.push(r);return {text:JSON.stringify({checks:qs.map((q,n)=>({...check(q),answerText:n===1?q.options.A:n===2?'ambiguous':q.options[q.correctAnswer]}))})};
 }}};
 const r=await verifyDraft(ai,'synthetic-pro',qs,files,'hard');
 assert.equal(r.exam.length,1);assert.equal(r.excluded.length,2);
 const sent=requests[0].contents;assert.ok(!sent.includes('correctAnswer'));assert.ok(!sent.includes('WRITER_KEY_DO_NOT_EXPOSE'));
 assert.equal(r.exam[0].metadata.sources[0].page,7);assert.equal(r.exam[0].options[r.exam[0].correctAnswer],'3');
 assert.ok(r.exam[0].explanation.includes(`${r.exam[0].correctAnswer}: The proposed count is 3.`));assert.match(r.exam[0].explanation,/Hepatitis B/);
});
test('invalid evidence, trivial distractors and an unrelated objective are excluded, not given coverage',async()=>{
 const {reviewedQuestion,verifyDraft}=await verifier();const q=parseProjectExam(fixture()).questions[0];
 assert.throws(()=>reviewedQuestion(q,{...check(q),evidence:[{title:files[0].name,quote:'An invented reference passage not in the supplied source.'}]},files),/quotation/);
 assert.throws(()=>reviewedQuestion(q,{...check(q),objectiveFits:false},files),/objective/);
 assert.throws(()=>reviewedQuestion(q,{...check(q),criteriaChecks:[]},files),/source criteria/);
 const r=await verifyDraft({models:{generateContent:async()=>({text:JSON.stringify({checks:[{...check(q),difficulty:'trivial'}]})})}},'synthetic-pro',[q],files,'standard');
 assert.equal(r.exam.length,0);assert.equal(r.excluded.length,1);
});
test('reference-note evidence remains labelled through checking and exam import',async()=>{
 const {reviewedQuestion}=await verifier();const original=fixture();const q=parseProjectExam(original).questions[0];
 const checked=reviewedQuestion(q,check(q),[{...files[0],kind:'supplement'}]);
 assert.equal(checked.metadata.sources[0].kind,'supplement');
 original.questions[0]=checked;
 assert.equal(parseProjectExam(original).questions[0].metadata.sources?.[0].kind,'supplement');
});
test('a failed checking service is reported distinctly and never retried; a mismatched recheck cannot resolve a miss',async()=>{
 const {verifyDraft}=await verifier();const q=parseProjectExam(fixture()).questions[0];let calls=0;
 const failed=await verifyDraft({models:{generateContent:async()=>{calls++;throw Object.assign(new Error('Synthetic service failure'),{status:429});}}},'synthetic-pro',[q],files,'standard');
 assert.equal(calls,1);assert.equal(failed.excluded[0].checkUnavailable,true);assert.equal(failed.exam.length,0);
 q.metadata.rechecksItemId='missed-1';
 const result=await verifyDraft({models:{generateContent:async()=>({text:JSON.stringify({checks:[{...check(q),recheckFits:false}]})})}},'synthetic-pro',[q],files,'standard',{}, {'missed-1':{task:'Combine both groups',vignette:'An earlier case',leadIn:'What is the total?'}});
 assert.equal(result.exam.length,0);assert.match(result.excluded[0].reason,/missed task/);
});

test('the checker receives exam references and rejects an item that fails reference calibration',async()=>{
 const {verifyDraft}=await verifier();const q=parseProjectExam(fixture()).questions[0];let sent='';
 const ai={models:{generateContent:async(r:any)=>{sent=r.contents;return {text:JSON.stringify({checks:[{...check(q),referenceFit:false}]})};}}};
 const result=await verifyDraft(ai,'synthetic',[q],files,'hard',{}, {}, {},Date.now()+10000,[{...files[0],name:'Historical exam example',content:'ACTUAL_EXAM_STYLE_REFERENCE'}]);
 assert.ok(sent.includes('ACTUAL_EXAM_STYLE_REFERENCE'));assert.ok(!sent.includes(q.explanation));
 assert.equal(result.exam.length,0);assert.match(result.excluded[0].reason,/exam references/);
});


test('one invented source does not discard another valid item and historical text cannot leak through feedback',async()=>{
 const {verifyDraft}=await verifier();const qs=parseProjectExam(fixture()).questions.slice(0,2);
 qs[1].metadata.sourceDocument='Invented';
 const first=await verifyDraft({models:{generateContent:async()=>({text:JSON.stringify({checks:[check(qs[0])]})})}},'synthetic',qs,files,'hard');
 assert.equal(first.exam.length,1);assert.equal(first.excluded.length,1);assert.match(first.excluded[0].reason,/not a supplied/);
 const historical='A unique imaginary traveller carries twelve purple stones to the northern village before dawn.';
 const leaked={...check(qs[0]),referenceFit:true,reasoning:historical};
 const second=await verifyDraft({models:{generateContent:async()=>({text:JSON.stringify({checks:[leaked]})})}},'synthetic',[qs[0]],files,'hard',{}, {}, {},Date.now()+10000,[{...files[0],name:'Past question',content:historical}]);
 assert.equal(second.exam.length,0);assert.match(second.excluded[0].reason,/copied a passage/);
});
