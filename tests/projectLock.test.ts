import test from 'node:test';
import assert from 'node:assert/strict';
import {projectLock} from '../services/projectLock.ts';
const tick=()=>new Promise(r=>setTimeout(r,10));
class FakeLocks {
  held=false; queue:any[]=[];
  request(_name:string,options:any,callback:any){return new Promise<void>((resolve,reject)=>{const job={options,callback,resolve,reject};options.signal.addEventListener('abort',()=>{this.queue=this.queue.filter(j=>j!==job);reject(Object.assign(new Error('aborted'),{name:'AbortError'}));});this.queue.push(job);this.next();});}
  next(){if(this.held||!this.queue.length)return;const j=this.queue.shift();if(j.options.signal.aborted){this.next();return;}this.held=true;Promise.resolve().then(()=>j.callback({})).then(j.resolve,j.reject).finally(()=>{this.held=false;this.next();});}
}
function setup(){const locks=new FakeLocks(),bus=new Set<any>();const clients:any[]=[];
 const client=(beforeRelease=async()=>{},afterAcquire=async()=>{})=>{const listeners=new Set<any>();const channel={postMessage(data:any){for(const c of bus)if(c!==channel)for(const fn of c.listeners)void fn({data});},listeners,addEventListener(_n:string,f:any){listeners.add(f);},removeEventListener(_n:string,f:any){listeners.delete(f);},close(){bus.delete(channel);}};bus.add(channel);const states:string[]=[];const api=projectLock({name:'project',locks:locks as any,channel:channel as any,onState:s=>states.push(s),beforeRelease,afterAcquire});clients.push(api);return {api,states};};
 return {client,close:()=>clients.forEach(c=>c.dispose())};
}
test('a blocked tab becomes editable automatically when the owner closes',async()=>{const f=setup();try{const a=f.client();await tick();const b=f.client();await tick();assert.equal(a.states.at(-1),'ready');assert.equal(b.states.at(-1),'waiting');a.api.dispose();await tick();assert.equal(b.states.at(-1),'ready');}finally{f.close();}});
test('the original holder automatically recovers after handing off and the new holder closes',async()=>{const f=setup();try{const a=f.client();await tick();const b=f.client();await tick();b.api.useHere();await tick();assert.equal(b.states.at(-1),'ready');b.api.dispose();await tick();assert.equal(a.states.at(-1),'ready');}finally{f.close();}});
test('Use this tab saves before handoff, then reads the saved answers',async()=>{const f=setup();const order:string[]=[];let answer='';try{const a=f.client(async()=>{await tick();answer='B';order.push('saved');});await tick();const b=f.client(async()=>{},async()=>{assert.equal(answer,'B');order.push('loaded');});await tick();b.api.useHere();await tick();await tick();assert.deepEqual(order,['saved','loaded']);assert.equal(a.states.at(-1),'waiting');assert.equal(b.states.at(-1),'ready');a.api.useHere();await tick();assert.equal(a.states.at(-1),'ready');}finally{f.close();}});
test('a failed save retains ownership and cannot enable two writers',async()=>{const f=setup();try{const a=f.client(async()=>{throw new Error('offline');});await tick();const b=f.client();await tick();b.api.useHere();await tick();assert.equal(a.states.at(-1),'ready');assert.equal(b.states.at(-1),'waiting');}finally{f.close();}});
test('disposing during async acquisition releases the lock for the next tab',async()=>{const f=setup();try{let done!:()=>void;const a=f.client(async()=>{},()=>new Promise<void>(r=>{done=r;}));await tick();const b=f.client();a.api.dispose();done();await tick();assert.equal(b.states.at(-1),'ready');assert.ok(!a.states.includes('ready'));}finally{f.close();}});
