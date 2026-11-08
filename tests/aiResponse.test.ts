import test from 'node:test';
import assert from 'node:assert/strict';
import {readAIResponse} from '../services/aiResponse.ts';

test('a non-JSON hosting failure preserves its HTTP status and explains that exams are safe', async()=>{
  await assert.rejects(readAIResponse(new Response('A server error has occurred',{status:500})),(error:any)=>{
    assert.equal(error.status,500);
    assert.equal(error.code,'invalid_response');
    assert.match(error.message,/HTTP 500/);
    assert.match(error.message,/existing exams are unchanged/);
    assert.doesNotMatch(error.message,/Unexpected token/);
    return true;
  });
});

test('provider JSON errors retain their actionable quota details',async()=>{
  const payload={error:'Provider quota exhausted',code:'quota'};
  assert.deepEqual(await readAIResponse(new Response(JSON.stringify(payload),{status:429})),payload);
});

test('successful malformed or non-object output cannot be mistaken for an exam',async()=>{
  for(const body of ['<html>gateway page</html>','null','[]']){
    await assert.rejects(readAIResponse(new Response(body)),/unreadable response/);
  }
});
