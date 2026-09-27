import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

test('production generation uses the replacement model and parses a mocked SDK response', async () => {
  const savedEnv = { ...process.env }, originalFetch = globalThis.fetch;
  process.env.VERCEL_ENV = 'production'; process.env.GEMINI_API_KEY = 'synthetic-test-key';
  delete process.env.DISABLE_AI; delete process.env.GEMINI_QUESTION_MODEL;
  const requests: { url: string; body: any }[] = [];
  const exam = [{ id: 1, vignette: 'Synthetic transport fixture' }];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, body: JSON.parse(await request.text()) });
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ exam }) }] }, finishReason: 'STOP' }] }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const bundle = await build({ entryPoints: ['api/generate.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external' });
    const module = { exports: {} as { default: (req: unknown, res: unknown) => Promise<unknown> } };
    new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
    for (const [difficulty, level, model] of [['standard', 'LOW', 'gemini-3.1-pro-preview'], ['hard', 'MEDIUM', 'test-configured-pro']] as const) {
      if (difficulty === 'hard') process.env.GEMINI_QUESTION_MODEL = ` ${model} `;
      let status = 0, body: any;
      const res = { status(n: number) { status = n; return this; }, json(v: unknown) { body = v; return this; } };
      await module.exports.default({ method: 'POST', body: { prompt: 'Synthetic transport check', difficulty } }, res);
      assert.equal(status, 200); assert.deepEqual(body, { exam });
      const request = requests.at(-1)!;
      assert.ok(request.url.includes(`/models/${model}:generateContent`));
      assert.equal(request.body.generationConfig.thinkingConfig.thinkingLevel, level);
      assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
    }
    assert.equal(requests.length, 2); // All transport is stubbed; no paid API request occurs.
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ['VERCEL_ENV', 'GEMINI_API_KEY', 'DISABLE_AI', 'GEMINI_QUESTION_MODEL']) {
      if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
    }
  }
});
