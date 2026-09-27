import type { Project } from '../types.ts';
const DATABASE='medexam-projects-v1';
let connection:Promise<IDBDatabase>|undefined;
function db() {
  if(!connection) connection=new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open(DATABASE,1);
    req.onupgradeneeded=()=>req.result.createObjectStore('projects',{keyPath:'key'});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>{connection=undefined;reject(req.error);};
  });
  return connection;
}
const key=(p:Project)=>p.storageMode==='local'?`local:${p.id}`:`cloud:${p.userId}:${p.id}`;
export async function cacheProject(project:Project,expectedLastModified?:string) {
  const d=await db();
  await new Promise<void>((resolve,reject)=>{
    const t=d.transaction('projects','readwrite'),store=t.objectStore('projects');
    const old=store.get(key(project));
    old.onsuccess=()=>{
      // A delayed cloud response must not overwrite a newer local answer.
      if(expectedLastModified && old.result?.project.lastModified!==expectedLastModified)return;
      if(!old.result || old.result.project.lastModified<=project.lastModified) store.put({key:key(project),project});
    };
    t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error || new Error('Local save was interrupted.'));
  });
}
export async function cachedProjects(userId='local'):Promise<Project[]> {
  const d=await db();
  return new Promise((resolve,reject)=>{
    const r=d.transaction('projects','readonly').objectStore('projects').getAll();
    r.onsuccess=()=>resolve(r.result.filter(row=>userId==='local'?row.key.startsWith('local:'):row.key.startsWith(`cloud:${userId}:`)).map(row=>row.project).sort((a,b)=>b.lastModified.localeCompare(a.lastModified)));
    r.onerror=()=>reject(r.error);
  });
}
export async function removeCachedProject(project:Project) {
  const d=await db();
  return new Promise<void>((resolve,reject)=>{const t=d.transaction('projects','readwrite');t.objectStore('projects').delete(key(project));t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});
}
