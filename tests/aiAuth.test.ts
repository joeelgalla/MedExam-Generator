import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
test('all paid routes reject anonymous requests before model transport',async()=>{
 const prev={...process.env},fetch=globalThis.fetch;let calls=0;
 process.env.VERCEL_ENV='production';delete process.env.DISABLE_AI;process.env.GEMINI_API_KEY='synthetic';
 globalThis.fetch=async()=>{calls++;throw new Error('Unexpected transport');};
 try {for(const route of ['generate','analyze','chat','ocr']){
  const bundle=await build({entryPoints:[`api/${route}.ts`],bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
  const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  let status=0;const res={status(n:number){status=n;return this;},json(){return this;}};
  await module.exports.default({method:'POST',headers:{},body:{}},res);assert.equal(status,401,route);
 }assert.equal(calls,0);}finally{globalThis.fetch=fetch;for(const k of ['VERCEL_ENV','DISABLE_AI','GEMINI_API_KEY']){if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k];}}
});
test('verified but unapproved accounts are rejected, and an empty allowlist fails closed',async()=>{
 const saved={...process.env},fetch=globalThis.fetch;
 process.env.VITE_SUPABASE_URL='https://synthetic.supabase.co';process.env.VITE_SUPABASE_ANON_KEY='synthetic';
 globalThis.fetch=async()=>new Response(JSON.stringify({id:'other-user',is_anonymous:false}),{headers:{'content-type':'application/json'}});
 try {
  const bundle=await build({entryPoints:['lib/server/aiAuth.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
  const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  for(const [allow,expected] of [['existing-owner',403],['',503]] as const){
   process.env.AI_ALLOWED_USER_IDS=allow;let status=0;const res={status(n:number){status=n;return this;},json(){return this;}};
   assert.equal(await module.exports.requireAIUser({headers:{authorization:'Bearer synthetic'}},res),false);assert.equal(status,expected);
  }
 }finally{globalThis.fetch=fetch;for(const k of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','AI_ALLOWED_USER_IDS']){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
});
