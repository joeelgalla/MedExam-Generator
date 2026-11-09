import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StickyNote } from 'lucide-react';
import type { ExamQuestion, Project } from '../types';
import { cleanFlagNote, flagNoteKey, MAX_FLAG_NOTE, type FlagNote, type FlagNoteStore } from '../services/flagNotes';

type Notes = {
  currentAttemptId: string | null;
  get: (attemptId: string | null | undefined, questionId: number) => FlagNote | undefined;
  save: (attemptId: string, question: ExamQuestion, text: string) => Promise<void>;
};

const NotesContext = createContext<Notes | null>(null);

// Notes belong to a signed-in account. Without this provider (device-only
// projects, the standalone practice page) no note controls render.
export function FlagNoteProvider({ project, store, children }: { project: Project; store: FlagNoteStore; children: React.ReactNode }) {
  const [notes, setNotes] = useState<Map<string, FlagNote>>(() => new Map());
  useEffect(() => {
    let live = true;
    setNotes(new Map());
    store.load(project.id).then(rows => { if (live) setNotes(new Map(rows.map(r => [flagNoteKey(r.attempt_id, r.question_id), r]))); }).catch(() => {});
    return () => { live = false; };
  }, [project.id, store]);
  const value = useMemo<Notes>(() => ({
    currentAttemptId: project.activeExam.attemptId || null,
    get: (attemptId, questionId) => attemptId ? notes.get(flagNoteKey(attemptId, questionId)) : undefined,
    save: async (attemptId, question, text) => {
      const note = cleanFlagNote(text), key = flagNoteKey(attemptId, question.id);
      if (!note) {
        await store.remove(project.id, attemptId, question.id);
        setNotes(current => { const next = new Map(current); next.delete(key); return next; });
        return;
      }
      const row = await store.save({ project_id: project.id, attempt_id: attemptId, question_id: question.id, item_id: question.metadata.itemId || null, note });
      setNotes(current => new Map(current).set(key, row));
    },
  }), [notes, project.id, project.activeExam.attemptId, store]);
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function FlagNoteScope({ enabled, project, store, children }: { enabled: boolean; project: Project; store: FlagNoteStore; children: React.ReactNode }) {
  return enabled ? <FlagNoteProvider project={project} store={store}>{children}</FlagNoteProvider> : <>{children}</>;
}

// Beside "Flagged" during an exam: a quiet Note button with a popover anchored
// to the question header, like Report.
export function FlagNoteButton({ question }: { question: ExamQuestion }) {
  const notes = useContext(NotesContext);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!notes?.currentAttemptId) return null;
  const attemptId = notes.currentAttemptId;
  const existing = notes.get(attemptId, question.id);
  const id = `flag-note-${question.metadata.itemId || question.id}`.replace(/[^A-Za-z0-9_-]/g, '-');
  const save = async (value: string) => {
    setBusy(true); setError('');
    try { await notes.save(attemptId, question, value); setOpen(false); }
    catch (e) { setError(`Couldn't save: ${(e as Error).message}. Check you're signed in and online, then try again.`); }
    finally { setBusy(false); }
  };
  return <div className="print:hidden">
    <button type="button" aria-expanded={open} aria-controls={id} title={existing ? 'Edit why you flagged this' : 'Add a note on why you flagged this'}
      onClick={() => { if (!open) setText(existing?.note || ''); setOpen(!open); setError(''); }}
      className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${existing ? 'text-orange-700 bg-orange-50 font-bold' : 'text-orange-500 hover:bg-orange-50'}`}>
      <StickyNote className="w-4 h-4" />{existing ? 'Note' : 'Add note'}
    </button>
    {open && <div id={id} className="absolute left-3 right-3 top-full z-30 mt-2 sm:left-auto sm:right-4 sm:w-[22rem] rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-left shadow-lg">
      <label htmlFor={`${id}-text`} className="font-medium text-slate-800">Why did you flag this?</label>
      <textarea id={`${id}-text`} rows={2} maxLength={MAX_FLAG_NOTE} value={text} onChange={e => setText(e.target.value)} autoFocus
        placeholder="For example: unsure between B and C, check the lithium levels"
        className="mt-2 w-full rounded-md border border-slate-300 bg-white p-2 text-sm" />
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="action-primary" disabled={busy} onClick={() => save(text)}>Save note</button>
        {existing && <button type="button" className="action-secondary" disabled={busy} onClick={() => save('')}>Delete note</button>}
        <button type="button" className="action-quiet" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Only you see this. It shows on the question here, in your results and in Progress.</p>
    </div>}
  </div>;
}

// The saved note, shown on a flagged question so the reason is right there.
export function FlagNoteLine({ question, attemptId, flagged, className = '' }: { question: ExamQuestion; attemptId?: string | null; flagged: boolean; className?: string }) {
  const notes = useContext(NotesContext);
  const note = flagged && notes ? notes.get(attemptId === undefined ? notes.currentAttemptId : attemptId, question.id) : undefined;
  if (!note) return null;
  return <p className={`flex items-start gap-1.5 rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-900 ${className}`}>
    <StickyNote className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="font-medium">Why you flagged it:</span> <span className="whitespace-pre-wrap">{note.note}</span></span>
  </p>;
}
