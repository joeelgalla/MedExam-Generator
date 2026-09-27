import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {importProject,addExam,parseProjectExam,beginProjectExam,submitProjectExam} from '../services/projectWorkflow.ts';
import {fixture} from './fixtures.ts';

test('actual save service retries a conditional-write conflict and preserves both devices histories',async()=>{
 const base=importProject({name:'CAS test',blueprint:[{id:'basics',title:'Foundations',files:[],questionCount:'3'}]},'owner','cloud');
 const e=parseProjectExam(fixture());let local=submitProjectExam(beginProjectExam(addExam(base,e),e,1000),2000);
 let remote=structuredClone(local);remote.examHistory=[{...local.examHistory[0],id:'remote-attempt'}];remote.lastModified='2026-01-01T00:00:00Z';local.lastModified='2026-01-02T00:00:00Z';
 const transport={remote:{data:remote,last_modified:remote.lastModified},writes:0,cache:[] as any[],saved:null as any,fail:false};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:transport.remote,error:null})})}),update:(row:any)=>({eq:()=>({eq:(_k:string,expected:string)=>({select:async()=>{transport.writes++;if(transport.fail)return{data:null,error:{message:'offline'}};if(transport.writes===1){transport.remote.last_modified='2026-01-03T00:00:00Z';return{data:[],error:null};}assert.equal(expected,transport.remote.last_modified);transport.saved=row;return{data:[{id:row.id}],error:null};}})})})})};
 const bundle=await build({entryPoints:['services/storageService.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'mock-storage',setup(b){b.onResolve({filter:/lib\/supabase|\.\/localProjects/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path.includes('supabase')?'export const supabase=TEST_SUPABASE;':'export const cacheProject=TEST_CACHE;export const cachedProjects=async()=>[];export const removeCachedProject=async()=>{};',loader:'ts'}));}}]});
 const module={exports:{} as any};new Function('require','module','exports','TEST_SUPABASE','TEST_CACHE',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports,client,async(p:any)=>transport.cache.push(p));
 const saved=await module.exports.saveProject(local);assert.equal(transport.writes,2);assert.equal(saved.examHistory.length,2);assert.equal(transport.saved.data.examHistory.length,2);assert.equal(transport.cache.at(-1).examHistory.length,2);
 transport.fail=true;await assert.rejects(module.exports.saveProject({...local,lastModified:new Date().toISOString()}),/cloud sync failed/);assert.ok(transport.cache.length>=3);
});

test('one conflict preserves a local recovery without hiding other cloud projects',async()=>{
 const base=importProject({name:'Conflict',blueprint:[{id:'basics',title:'Foundations',files:[],questionCount:'3'}]},'owner','cloud');
 const e=parseProjectExam(fixture());const local=submitProjectExam(beginProjectExam(addExam(base,e),e,1000),2000);
 const remote=structuredClone(local);remote.examHistory[0].answers={1:'A'};
 const other={...structuredClone(base),id:'other-cloud-project',name:'Cloud only'};
 const removed={...structuredClone(base),id:'deleted-elsewhere',cloudSyncedAt:'2026-01-01T00:00:00Z'};
 const cache:any[]=[];let failCache=false;const client={from:()=>({select:()=>({order:async()=>({data:[{data:remote},{data:other}],error:null})})})};
 const bundle=await build({entryPoints:['services/storageService.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'mock-load',setup(b){b.onResolve({filter:/lib\/supabase|\.\/localProjects/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path.includes('supabase')?'export const supabase=TEST_SUPABASE;':'export const cacheProject=TEST_CACHE;export const cachedProjects=TEST_READ;export const removeCachedProject=async()=>{};',loader:'ts'}));}}]});
 const module={exports:{} as any};new Function('require','module','exports','TEST_SUPABASE','TEST_CACHE','TEST_READ',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports,client,async(p:any)=>{if(failCache)throw new Error('Quota');cache.push(p);},async()=>[local,removed]);
 const result=await module.exports.getAllProjects('owner');
 assert.equal(result.length,3);assert.ok(result.find((p:any)=>p.id==='other-cloud-project'));
 assert.deepEqual(result.find((p:any)=>p.id===remote.id).examHistory,remote.examHistory);
 assert.ok(result.find((p:any)=>p.id===remote.id).syncNotice);
 assert.equal(cache.length,3);assert.equal(cache[0].storageMode,'local');assert.deepEqual(cache[0].examHistory,local.examHistory);
 assert.equal(result.find((p:any)=>p.id.startsWith('deleted-elsewhere')).storageMode,'local');
 failCache=true;const degraded=await module.exports.getAllProjects('owner');assert.ok(degraded.find((p:any)=>p.id==='other-cloud-project'));assert.match(degraded.find((p:any)=>p.id===local.id).syncNotice,/storage failed/);
});
