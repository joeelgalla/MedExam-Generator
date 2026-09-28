import React, {useState} from 'react';
import {Copy, Mail, MessageSquare, X} from 'lucide-react';

// Keep this component outside App: a nested component remounts on each input
// update, replacing the focused textarea after the first character.
export default function FeedbackModal({text,onChange,onClose,user}:{text:string;onChange:(value:string)=>void;onClose:()=>void;user:string|null}) {
  const [notice,setNotice]=useState('');
  const body=`MedExam Beta Feedback\nUser: ${user || 'Guest'}\n\n${text}`;
  const email=`mailto:?subject=${encodeURIComponent('MedExam Beta Feedback')}&body=${encodeURIComponent(body)}`;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 relative" onKeyDown={e=>{if(e.key==='Escape')onClose();}}>
      <button aria-label="Close feedback" onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
      <h3 id="feedback-title" className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-blue-600"/> Beta Feedback</h3>
      <p className="text-sm text-slate-500 mb-4">Copy your feedback to share with the app owner, or open an email draft and choose a recipient. Closing this dialog keeps your draft.</p>
      <label htmlFor="feedback-text" className="sr-only">Describe your issue or suggestion</label>
      <textarea id="feedback-text" autoFocus value={text} onChange={e=>{onChange(e.target.value);setNotice('');}} placeholder="Describe your issue or suggestion..." className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-y mb-4 text-sm"/>
      <div className="flex flex-wrap gap-2">
        <button disabled={!text.trim()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold px-3 py-2 rounded-lg" onClick={async()=>{try{await navigator.clipboard.writeText(body);setNotice('Feedback copied. Paste it into your message to the app owner.');}catch{setNotice('Clipboard unavailable. Select and copy your message from the text box.');}}}><Copy className="w-4 h-4"/>Copy feedback</button>
        {text.trim() && <a href={email} className="flex items-center gap-2 border px-3 py-2 rounded-lg" onClick={()=>setNotice('Email draft requested. If it did not open, use Copy feedback.')}><Mail className="w-4 h-4"/>Open email draft</a>}
        <button disabled={!text} className="text-sm text-slate-600 disabled:text-slate-300 px-2" onClick={()=>{onChange('');setNotice('');}}>Clear</button>
      </div>
      {notice && <p role="status" className="text-sm mt-3 text-blue-800">{notice}</p>}
    </div>
  </div>;
}
