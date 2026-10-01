import test from 'node:test';
import assert from 'node:assert/strict';
import {copiesExamReference} from '../services/examReferences.ts';
test('verbatim historical passages are blocked without blocking shared short medical facts',()=>{
 const refs=[{id:'synthetic',type:'txt' as const,size:100,name:'Synthetic history',content:'A unique imaginary traveller carries twelve purple stones to the northern village before dawn.'}];
 assert.equal(copiesExamReference('The answer is true. A unique imaginary traveller carries twelve purple stones to the northern village before dawn.',refs),true);
 assert.equal(copiesExamReference('A different traveller carries stones during a morning journey.',refs),false);
 assert.equal(copiesExamReference('Treat with aspirin.',[{id:'synthetic',type:'txt' as const,size:100,name:'Synthetic',content:'Treat with aspirin.'}]),false);
});
