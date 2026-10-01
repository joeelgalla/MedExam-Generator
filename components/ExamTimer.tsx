import React,{useEffect,useState} from 'react';
export default function ExamTimer({endsAt,answered,total}:{endsAt:number;answered:number;total:number}) {
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const tick=()=>setNow(Date.now());tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[endsAt]);
 const seconds=Math.max(0,Math.ceil((endsAt-now)/1000));
 return <div style={{top:'var(--workspace-header-height, 64px)'}} className="sticky z-10 bg-blue-950 text-white p-3 rounded mb-4 text-sm sm:text-base print:hidden"><p className="font-mono" role="timer">{seconds ? `Suggested time remaining: ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}` : 'Suggested time reached'} · {answered}/{total} answered</p><p className="text-sm text-blue-100 mt-1">{seconds ? 'The timer will not submit your exam.' : 'Keep answering at your own pace.'} Answers appear only when you press Finish exam.</p></div>;
}
