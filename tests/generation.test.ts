import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

test('production generation uses the replacement model and parses a mocked SDK response', async () => {
  const savedEnv = { ...process.env }, originalFetch = globalThis.fetch, originalInfo = console.info;
  const usageLogs: unknown[][] = [];
  console.info = (...args) => { usageLogs.push(args); };
  process.env.VERCEL_ENV = 'production'; process.env.GEMINI_API_KEY = 'synthetic-test-key';
  process.env.VITE_SUPABASE_URL='https://synthetic.supabase.co';process.env.VITE_SUPABASE_ANON_KEY='synthetic-anon';
  process.env.AI_ALLOWED_USER_IDS='synthetic-user';
  delete process.env.DISABLE_AI; delete process.env.GEMINI_QUESTION_MODEL;
  const requests: { url: string; body: any }[] = [];
  const exam = [{ id: 1, vignette: 'Synthetic transport fixture' }];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if(request.url.includes('/auth/v1/user')) return new Response(JSON.stringify({id:'synthetic-user',is_anonymous:false}),{headers:{'content-type':'application/json'}});
    requests.push({ url: request.url, body: JSON.parse(await request.text()) });
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ exam }) }] }, finishReason: 'STOP' }], usageMetadata:{promptTokenCount:100,cachedContentTokenCount:20,candidatesTokenCount:30,thoughtsTokenCount:40,totalTokenCount:170} }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const bundle = await build({ entryPoints: ['api/generate.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external' });
    const module = { exports: {} as { default: (req: unknown, res: unknown) => Promise<unknown> } };
    new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
    for (const [difficulty, level, model] of [['standard', 'LOW', 'gemini-3.1-pro-preview'], ['hard', 'MEDIUM', 'test-configured-pro']] as const) {
      if (difficulty === 'hard') process.env.GEMINI_QUESTION_MODEL = ` ${model} `;
      let status = 0, body: any;
      const res = { status(n: number) { status = n; return this; }, json(v: unknown) { body = v; return this; } };
      await module.exports.default({ method: 'POST', headers:{authorization:'Bearer synthetic-token'}, body: { prompt: 'Synthetic transport check', difficulty, hasObjectiveRegistry:difficulty === 'standard' } }, res);
      assert.equal(status, 200); assert.deepEqual(body, { exam });
      const request = requests.at(-1)!;
      assert.ok(request.url.includes(`/models/${model}:generateContent`));
      assert.equal(request.body.generationConfig.thinkingConfig.thinkingLevel, level);
      assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
      const metadata=request.body.generationConfig.responseSchema.properties.exam.items.properties.metadata.properties;
      for(const key of ['objectiveIds','topicId','bucketId','itemId','caseId','sources']) assert.ok(metadata[key],key);
      const required=request.body.generationConfig.responseSchema.properties.exam.items.properties.metadata.required;
      for(const key of ['objectiveIds','topicId','bucketId']) assert.equal(required.includes(key),difficulty === 'standard',key);
      assert.deepEqual(request.body.generationConfig.responseSchema.required,['exam']);
      assert.deepEqual(JSON.parse(usageLogs.at(-1)![1] as string),{model,promptTokens:100,cachedTokens:20,outputTokens:30,thinkingTokens:40,totalTokens:170});
    }
    assert.equal(requests.length, 2); // All transport is stubbed; no paid API request occurs.
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    for (const key of ['VERCEL_ENV', 'GEMINI_API_KEY', 'DISABLE_AI', 'GEMINI_QUESTION_MODEL','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','AI_ALLOWED_USER_IDS']) {
      if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
    }
  }
});

test('upstream failures are never automatically retried and zero Pro quota names the billing action', async () => {
  const savedEnv={...process.env}, originalFetch=globalThis.fetch, originalError=console.error;
  Object.assign(process.env,{VERCEL_ENV:'production',GEMINI_API_KEY:'synthetic-test-key',VITE_SUPABASE_URL:'https://synthetic.supabase.co',VITE_SUPABASE_ANON_KEY:'synthetic',AI_ALLOWED_USER_IDS:'synthetic-user'});
  delete process.env.DISABLE_AI;
  const errors: unknown[][]=[];console.error=(...args)=>{errors.push(args);};
  let calls=0;
  const message='Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: synthetic-pro';
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init);
    if(request.url.includes('/auth/v1/user')) return new Response(JSON.stringify({id:'synthetic-user',is_anonymous:false}),{headers:{'content-type':'application/json'}});
    calls++;
    return new Response(JSON.stringify({error:{code:429,status:'RESOURCE_EXHAUSTED',message}}),{status:429,headers:{'content-type':'application/json'}});
  };
  try {
    for(const route of ['generate','analyze','chat','ocr']) {
      const bundle=await build({entryPoints:[`api/${route}.ts`],bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
      const module={exports:{} as {default:(req:unknown,res:unknown)=>Promise<unknown>}};
      new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
      let status=0,body:any;const before=calls;
      const res={status(n:number){status=n;return this;},json(v:unknown){body=v;return this;}};
      await module.exports.default({method:'POST',headers:{authorization:'Bearer synthetic'},body:{prompt:'Synthetic question',question:{vignette:'Synthetic',leadIn:'Test',options:{A:'One'},correctAnswer:'A'},files:[],history:[],userMessage:'Explain',base64Data:'AA==',mimeType:'image/png'}},res);
      assert.equal(calls-before,1,route);
      if(route==='generate') {assert.equal(status,429,String(errors.at(-1)?.[1]));assert.match(body.error,/zero quota/);assert.match(body.error,/billing in Google AI Studio/);}
      else assert.ok(status>=400,route);
    }
  } finally {
    globalThis.fetch=originalFetch;console.error=originalError;
    for(const k of ['VERCEL_ENV','GEMINI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','AI_ALLOWED_USER_IDS','DISABLE_AI']) {
      if(savedEnv[k]===undefined)delete process.env[k];else process.env[k]=savedEnv[k];
    }
  }
});
