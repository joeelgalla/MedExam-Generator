import test from 'node:test';
import assert from 'node:assert/strict';
import {generationError} from '../lib/server/generationError.ts';
test('quota exhaustion differs from temporary rate limiting without claiming the user is billed',()=>{
 const zero=generationError('429 RESOURCE_EXHAUSTED free_tier_requests limit: 0');
 assert.equal(zero.code,'quota');assert.match(zero.error,/zero quota/);assert.match(zero.error,/Waiting alone will not fix/);
 assert.equal(generationError('429 You exceeded your current quota').code,'quota');
 assert.equal(generationError('429 RESOURCE_EXHAUSTED requests too frequent').code,'rate_limit');
 assert.equal(generationError('503 UNAVAILABLE').status,503);
});
