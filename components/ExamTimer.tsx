import React,{useEffect,useState} from 'react';
export default function ExamTimer({endsAt,answered,total}:{endsAt:number;answered:number;total:number}) {
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const tick=()=>setNow(Date.now());tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[endsAt]);
 const seconds=Math.max(0,Math.ceil((endsAt-now)/1000));
 const clock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
 // One short line on phones so the pinned bar does not cover the question; the reminder shows on wider screens.
 return <div style={{top:'var(--workspace-header-height, 64px)'}} className="sticky z-10 bg-blue-950 text-white px-3 py-2 sm:p-3 rounded mb-4 text-sm sm:text-base print:hidden"><p className="font-mono" role="timer">{seconds ? <><span className="sm:hidden">{clock} left</span><span className="hidden sm:inline">Suggested time remaining: {clock}</span></> : 'Suggested time reached'} · {answered}/{total} answered</p><p className="hidden sm:block text-sm text-blue-100 mt-1">{seconds ? 'The timer will not submit your exam.' : 'Keep answering at your own pace.'} Answers appear only when you press Finish exam.</p></div>;
}
