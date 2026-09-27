import React,{useEffect,useRef,useState} from 'react';
export default function ExamTimer({endsAt,answered,total,onExpire}:{endsAt:number;answered:number;total:number;onExpire:()=>void}) {
 const [now,setNow]=useState(Date.now());const expiry=useRef(onExpire);expiry.current=onExpire;
 useEffect(()=>{let fired=false;const tick=()=>{const n=Date.now();setNow(n);if(n>=endsAt&&!fired){fired=true;expiry.current();}};tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[endsAt]);
 const seconds=Math.max(0,Math.ceil((endsAt-now)/1000));
 return <p className="sticky top-16 z-10 bg-blue-950 text-white p-3 rounded mb-4 font-mono print:hidden" role="timer">Time remaining: {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} · {answered}/{total} answered</p>;
}
