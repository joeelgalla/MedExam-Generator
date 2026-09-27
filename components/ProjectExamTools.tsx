import React, {useRef,useState} from 'react';
import type {Project,SavedExam} from '../types';
import {parseProjectExam,addExam,mergePracticeBackup,downloadText,projectShare,emptyExam,allowsOnlineAI} from '../services/projectWorkflow';
import {externalPacket,selectedSections} from '../services/generationPrompt';
export default function ProjectExamTools({project,onUpdate,onStart,onError,canUseAI}:{project:Project;onUpdate:(p:Project)=>void;onStart:(e:SavedExam)=>void;onError:(s:string)=>void;canUseAI:boolean}) {
  const file=useRef<HTMLInputElement>(null), backup=useRef<HTMLInputElement>(null);
  const [paste,setPaste]=useState(''),[showPaste,setShowPaste]=useState(false),[notice,setNotice]=useState('');
  const [includeSources,setIncludeSources]=useState(true),[shareSources,setShareSources]=useState(true),[shareExams,setShareExams]=useState(true);
  const run=(fn:()=>void)=>{try{fn();onError('');}catch(e){onError((e as Error).message);}};
  const importText=(text:string)=>run(()=>{
    const data=JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
    const exam=parseProjectExam(data,project.registry),next=addExam(project,exam);
    onUpdate(next);setPaste('');setShowPaste(false);setNotice(next===project?'This exam is already saved; no history was changed.':`Saved ${exam.title} (${exam.questions.length} questions). Choose Start when ready.`);
  });
  const load=async(e:React.ChangeEvent<HTMLInputElement>,isBackup=false)=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    if(f.size>20*1024*1024){onError('Choose a file under 20 MB.');return;}
    try {const text=await f.text();if(isBackup)run(()=>{onUpdate(mergePracticeBackup(project,JSON.parse(text)));setNotice('Practice attempts restored. Re-importing the same backup does not duplicate attempts.');});else importText(text);}catch(err){onError((err as Error).message);}
  };
  const selected=selectedSections(project);
  return <section className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-5 print:hidden">
    <div><h2 className="text-lg font-bold">Exams in this project</h2><p className="text-sm text-slate-600">Generate here or bring a JSON exam from Codex or Claude. Every completed exam joins this project's progress and review.</p></div>
    {notice&&<p role="status" className="text-sm text-blue-800">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      <button className="px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold" onClick={()=>file.current?.click()}>Import exam</button>
      <button className="px-3 py-2 border rounded-lg" onClick={()=>setShowPaste(!showPaste)}>Paste exam JSON</button>
      <button className="px-3 py-2 border rounded-lg" onClick={()=>backup.current?.click()}>Restore practice history</button>
      <button className="px-3 py-2 border rounded-lg" onClick={()=>downloadText(`${project.name}.project-backup.json`,JSON.stringify({format:'medexam-project-backup',version:1,project}))}>Download private backup</button>
      <input aria-label="Import exam file" ref={file} type="file" accept=".json" hidden onChange={e=>load(e)}/>
      <input aria-label="Restore practice history file" ref={backup} type="file" accept=".json" hidden onChange={e=>load(e,true)}/>
    </div>
    {showPaste&&<div><label className="block">Exam JSON<textarea aria-label="Exam JSON" className="w-full border rounded p-2 font-mono text-xs" rows={6} value={paste} onChange={e=>setPaste(e.target.value)}/></label><button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={()=>importText(paste)}>Validate and import</button></div>}
    {project.activeExam.questions.length>0 && project.activeExam.status==='active' && <button className="px-3 py-2 border rounded text-sm" onClick={()=>{onUpdate({...project,archivedExams:[...(project.archivedExams || []),{...project.activeExam,attemptId:project.activeExam.attemptId || crypto.randomUUID()}],activeExam:{...emptyExam(),selectedSectionIds:project.activeExam.selectedSectionIds}});setNotice('Unfinished exam saved below without scoring. You can start another exam.');}}>Set aside unfinished exam without scoring</button>}
    {!!project.archivedExams?.length && <details><summary className="cursor-pointer">Unfinished exams ({project.archivedExams.length})</summary><p className="text-xs my-2">These drafts do not count toward progress. Any original timer keeps running.</p>{project.archivedExams.map((a,i)=><button className="block border rounded px-3 py-2 my-2 text-sm" key={a.attemptId || i} disabled={project.activeExam.status==='active'&&project.activeExam.questions.length>0} onClick={()=>onUpdate({...project,activeExam:a,archivedExams:project.archivedExams!.filter((_,j)=>i!==j)})}>Resume {a.title || 'unfinished exam'} · {Object.keys(a.userAnswers).length} answers saved</button>)}</details>}
    <div className="space-y-2">{(project.savedExams || []).map(exam=>{
      const seen=new Set(project.examHistory.flatMap(a=>a.questions.map(q=>q.metadata.itemId)));
      const repeated=exam.questions.filter(q=>seen.has(q.metadata.itemId)).length;
      return <div key={exam.examId} className="flex flex-wrap justify-between gap-3 items-center rounded-lg bg-slate-50 p-3"><div><strong>{exam.title}</strong><p className="text-sm text-slate-600">{exam.questions.length} questions · {exam.durationMinutes} minutes{repeated?` · ${repeated} previously seen`:''}</p></div><div className="flex gap-2"><button className="border px-3 py-1.5 rounded bg-white" onClick={()=>downloadText(`${exam.examId}.exam.json`,JSON.stringify(exam.registry?{...exam,format:'medexam-practice'}:exam))}>Share exam</button><button className="bg-blue-600 text-white px-3 py-1.5 rounded" disabled={project.activeExam.status==='active'&&project.activeExam.questions.length>0} onClick={()=>onStart(exam)}>Start {exam.title}</button></div></div>;
    })}</div>
    <details><summary className="cursor-pointer font-semibold">Make the next exam with your AI</summary><div className="space-y-3 mt-3">
      <p className="text-sm">1. Choose sections and settings below. 2. Download the packet and attach it to Codex or Claude. 3. Import the returned JSON here. It uses the same project instructions and progress guidance as built-in generation.</p>
      <fieldset><legend className="text-sm font-semibold">Sections for the next exam</legend><div className="grid sm:grid-cols-2 gap-2 mt-2">{project.blueprint.map(s=><label key={s.id} className="text-sm flex gap-2"><input type="checkbox" checked={selected.some(x=>x.id===s.id)} onChange={e=>onUpdate({...project,activeExam:{...project.activeExam,selectedSectionIds:e.target.checked?[...selected.map(x=>x.id),s.id]:selected.filter(x=>x.id!==s.id).map(x=>x.id)}})}/>{s.title}</label>)}</div></fieldset>
      <label className="block text-sm"><input type="checkbox" checked={includeSources} onChange={e=>setIncludeSources(e.target.checked)}/> Include reference text in the downloaded packet (otherwise attach the named files yourself)</label>
      <div className="flex flex-wrap gap-2"><button className="px-3 py-2 bg-slate-900 text-white rounded" onClick={()=>run(()=>downloadText(`${project.name}-AI-packet.md`,externalPacket(project,includeSources),'text/markdown'))}>Download AI packet</button><button className="px-3 py-2 border rounded" onClick={async()=>{try{await navigator.clipboard.writeText('Use the attached MedExam AI packet to write a new exam. Follow its objectives, source evidence, worked examples, difficulty and previous-question exclusions. Return a JSON file with {"exam":[...]} for import. Verify each key and explain each distractor. Do not reuse example questions.');setNotice('Prompt copied. Attach the downloaded AI packet with it.');}catch{onError('Clipboard access failed. The full instructions are also inside the downloaded packet.');}}}>Copy prompt</button></div>
      <p className="text-xs text-slate-500">The packet contains selected learning material and previous practice stems. Keep held-out historical recalls out of project materials. Examples guide style; AI questions still need clinical review.</p>
    </div></details>
    <details><summary className="cursor-pointer font-semibold">Share this project</summary><div className="space-y-3 mt-3"><p className="text-sm">Your friend gets the same objectives, question-writing instructions and worked examples. Their attempts start empty.</p>
      <label className="block text-sm"><input type="checkbox" checked={shareSources} onChange={e=>setShareSources(e.target.checked)}/> Include reference documents</label>
      <label className="block text-sm"><input type="checkbox" checked={shareExams} onChange={e=>setShareExams(e.target.checked)}/> Include saved exams and their grading keys</label>
      <button className="px-3 py-2 border rounded" onClick={()=>downloadText(`${project.name}.medexam`,JSON.stringify(projectShare(project,shareSources,shareExams)))}>Download shared project</button>
      <p className="text-xs text-slate-500">Send the file yourself. Your friend signs in, chooses Import, and approves saving the file to their own account. They can also choose On this device for offline-only storage. Personal answers, flags, timers, account identity and history are excluded.</p>
    </div></details>
    {<label className="block text-sm border-t pt-3"><input type="checkbox" checked={allowsOnlineAI(project)} onChange={e=>onUpdate({...project,allowOnlineAI:e.target.checked})}/> Allow selected material to be sent to Gemini when I use built-in generation, the tutor or image/audio extraction. {canUseAI?'':'Sign in separately to use built-in AI; the downloaded packet works without an account.'}</label>}
  </section>;
}
