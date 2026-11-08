import test from 'node:test';
import assert from 'node:assert/strict';
import {generationError} from '../lib/server/generationError.ts';
import {billingError} from '../lib/server/billingError.ts';
test('depleted prepaid credits are an actionable payment failure, not a retryable request limit',()=>{
 const result=generationError('{"code":402,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}');
 assert.equal(result.status,402);assert.equal(result.code,'billing');
 assert.match(result.error,/restore credits in Google AI Studio/);
 assert.doesNotMatch(result.error,/too many requests|try again shortly/i);
 assert.equal(billingError({status:402})?.status,402);
 assert.equal(billingError({status:429,message:'RESOURCE_EXHAUSTED requests too frequent'}),null);
});
test('quota exhaustion differs from temporary rate limiting without claiming the user is billed',()=>{
 const zero=generationError('429 RESOURCE_EXHAUSTED free_tier_requests limit: 0');
 assert.equal(zero.code,'quota');assert.match(zero.error,/zero quota/);assert.match(zero.error,/Waiting alone will not fix/);
 assert.equal(generationError('429 You exceeded your current quota').code,'quota');
 assert.equal(generationError('429 RESOURCE_EXHAUSTED requests too frequent').code,'rate_limit');
 assert.equal(generationError('503 UNAVAILABLE').status,503);
});
