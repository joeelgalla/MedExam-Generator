import React, {useEffect, useRef} from 'react';
import {X} from 'lucide-react';

export default function WorkspaceDialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;const previous=document.activeElement;dialog?.showModal();return()=>{dialog?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
  return <dialog ref={ref} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} className="workspace-dialog rounded-2xl p-0 border border-slate-200 shadow-xl bg-white text-slate-900">
    <div className="p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4 mb-5"><h2 className="text-xl font-semibold tracking-tight">{title}</h2><button onClick={onClose} aria-label={`Close ${title}`} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5"/></button></div>
      {children}
    </div>
  </dialog>;
}
