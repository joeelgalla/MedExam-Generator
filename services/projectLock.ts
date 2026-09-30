/** Cooperatively hand over a single writer. Never steal a lock from unsaved work. */
export function projectLock({name,locks,channel,onState,beforeRelease,afterAcquire}:{
  name:string;locks:Pick<LockManager,'request'>;channel:Pick<BroadcastChannel,'postMessage'|'addEventListener'|'removeEventListener'|'close'>;
  onState:(state:'waiting'|'ready'|'transferring'|'error',message?:string)=>void;
  beforeRelease:()=>Promise<void>;afterAcquire:()=>Promise<void>;
}) {
  let stopped=false,owned=false,transferring=false,requeue=false,release:(()=>void)|undefined;
  let pending:AbortController|undefined;
  const request=()=>{
    if(stopped||owned||pending)return;
    const controller=new AbortController();pending=controller;onState('waiting');
    void locks.request(name,{signal:controller.signal},async()=>{
      if(stopped)return;
      pending=undefined;owned=true;
      // Install the release promise before async loading so cleanup cannot miss it.
      const held=new Promise<void>(resolve=>{release=resolve;});
      try{await afterAcquire();if(!stopped&&!transferring)onState('ready');}
      catch(e){onState('error',(e as Error).message);}
      if(stopped)release?.();
      await held;owned=false;release=undefined;
    }).catch(e=>{if(!stopped&&e.name!=='AbortError')onState('error','Could not open this project for editing. Reload to try again.');}).finally(()=>{if(pending===controller)pending=undefined;if(requeue&&!stopped){requeue=false;request();}});
  };
  const listener=async(event:MessageEvent)=>{
    if(event.data?.type==='transfer-failed'&&!owned&&!stopped){onState('waiting',String(event.data.message));return;}
    if(event.data?.type!=='request-control'||!owned||transferring||stopped)return;
    transferring=true;onState('transferring');
    try{await beforeRelease();requeue=true;release?.();onState('waiting','Continued in another tab. Use this tab to switch back.');}
    catch(e){onState('ready');channel.postMessage({type:'transfer-failed',message:(e as Error).message||'The other tab could not save yet. Finish saving there, then try again.'});}
    finally{transferring=false;}
  };
  channel.addEventListener('message',listener as EventListener);
  request();
  return {
    useHere(){request();channel.postMessage({type:'request-control'});},
    dispose(){stopped=true;pending?.abort();release?.();channel.removeEventListener('message',listener as EventListener);channel.close();}
  };
}
