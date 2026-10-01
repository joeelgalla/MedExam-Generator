import React from 'react';
import type {ExamQuestion} from '../types';

export default function SourcePassages({question}:{question:ExamQuestion}) {
  return <>{question.metadata.sources?.filter(s=>s.quote).map((s,i)=><details key={i} className="mt-3 border border-slate-200 rounded-lg p-3 bg-white text-sm"><summary className="cursor-pointer font-medium text-slate-800">Passage from the study material{s.page?` · p. ${s.page}`:''}</summary>{(s.kind==='supplement'||s.title.startsWith('Primary reference note -'))&&<p className="mt-2 text-xs font-medium text-amber-900">Supported by a reference note, rather than a handbook passage.</p>}<blockquote className="mt-3 whitespace-pre-line text-slate-700 leading-relaxed border-l-2 border-blue-200 pl-3">{s.quote}</blockquote><p className="mt-2 text-xs text-slate-500 break-words">{s.title}</p></details>)}</>;
}
