import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSourceAnalysis, sourceAnalysisError} from '../lib/server/sourceAnalysis.ts';
const files=[{name:'Synthetic reference p7.txt',content:'An image table lists blue\n  and green objects. The red object is absent.'}];
const result={finding:'partial',evidence:[{fileId:0,quote:'An image table lists blue and green objects.'}],analysis:'This supports only part of the proposed answer.'};

test('source evidence accepts whitespace differences but rejects invented text and files',()=>{
  const text=renderSourceAnalysis(result,files);
  assert.match(text,/Partial support found/);assert.match(text,/Synthetic reference p7/);
  assert.throws(()=>renderSourceAnalysis({...result,evidence:[{fileId:0,quote:'An image table lists blue and purple objects.'}]},files),/could not be matched/);
  assert.throws(()=>renderSourceAnalysis({...result,evidence:[{fileId:1,quote:result.evidence[0].quote}]},files),/could not be matched/);
  assert.throws(()=>renderSourceAnalysis({...result,evidence:[]},files),/no supporting quotations/);
});
test('no evidence found is bounded to supplied text and cannot assert the answer is wrong',()=>{
  const text=renderSourceAnalysis({finding:'not_found',evidence:[],analysis:'The original book definitely has no evidence.'},files);
  assert.match(text,/does not establish that the answer is wrong/);
  assert.match(text,/image tables and diagrams/);
  assert.doesNotMatch(text,/definitely/);
  assert.throws(()=>renderSourceAnalysis({...result,finding:'not_found'},files),/Inconsistent/);
});
test('source analysis preserves provider failures without inventing a context-size diagnosis',()=>{
  assert.equal(sourceAnalysisError({status:503}).status,503);
  assert.match(sourceAnalysisError({status:503}).error,/temporarily busy/);
  assert.equal(sourceAnalysisError({status:429}).status,429);
  assert.equal(sourceAnalysisError({status:403}).status,403);
  assert.equal(sourceAnalysisError(new Error('invalid quote')).status,502);
});

test('analysis API checks model quotes, preserves a 503 and does not retry invisibly',async()=>{
 const {build}=await import('esbuild');const{createRequire}=await import('node:module');
 const env={...process.env},fetchBefore=globalThis.fetch,errorBefore=console.error;
 Object.assign(process.env,{VERCEL_ENV:'production',GEMINI_API_KEY:'synthetic-test-key',VITE_SUPABASE_URL:'https://synthetic.supabase.co',VITE_SUPABASE_ANON_KEY:'synthetic',AI_ALLOWED_USER_IDS:'synthetic-user'});delete process.env.DISABLE_AI;console.error=()=>{};
 let calls=0;let scenario='matched';
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init);
  if(request.url.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'synthetic-user',is_anonymous:false}),{headers:{'content-type':'application/json'}});
  calls++;const body=JSON.parse(await request.text());
  assert.equal(body.generationConfig.responseMimeType,'application/json');
  assert.ok(body.generationConfig.responseSchema.properties.evidence);
  if(scenario==='busy')return new Response(JSON.stringify({error:{code:503,status:'UNAVAILABLE',message:'This model is currently experiencing high demand.'}}),{status:503,headers:{'content-type':'application/json'}});
  const answer=scenario==='matched'?result:{...result,evidence:[{fileId:0,quote:'A completely invented passage in a real file.'}]};
  return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(answer)}]},finishReason:'STOP'}]}),{headers:{'content-type':'application/json'}});
 };
 try {
  const bundle=await build({entryPoints:['api/analyze.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
  const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  for(const [name,expected]of[['matched',200],['invented',502],['busy',503]]as const){
   scenario=name;let status=0,payload:any;const previous=calls;
   await module.exports.default({method:'POST',headers:{authorization:'Bearer synthetic'},body:{question:{vignette:'Synthetic',leadIn:'Choose',correctAnswer:'A',options:{A:'One'}},files}},{status(n:number){status=n;return this;},json(v:any){payload=v;return this;}});
   assert.equal(status,expected);assert.equal(calls-previous,1);
   if(name==='matched')assert.match(payload.text,/Matched passage/);
   if(name==='invented')assert.match(payload.error,/checked quotation/);
   if(name==='busy')assert.match(payload.error,/temporarily busy/);
  }
 }finally{
  globalThis.fetch=fetchBefore;console.error=errorBefore;
  for(const k of ['VERCEL_ENV','GEMINI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','AI_ALLOWED_USER_IDS','DISABLE_AI']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}
 }
});
