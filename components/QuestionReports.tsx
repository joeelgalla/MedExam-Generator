import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, MessageSquareWarning } from 'lucide-react';
import type { ExamQuestion, Project } from '../types';
import { buildReportRow, reportItemId, MAX_REPORT_COMMENT, type QuestionReport, type ReportPlace, type ReportStore } from '../services/questionReports';
import { linkAttemptsToExams } from '../services/examStatus';

type Target = { question: ExamQuestion; where: ReportPlace; selectedOption: string | null; attemptId?: string | null };
type Reports = {
  find: (t: Target) => QuestionReport | undefined;
  save: (t: Target, comment: string) => Promise<void>;
  remove: (t: Target) => Promise<void>;
};

const ReportContext = createContext<Reports | null>(null);

// Reports belong to a signed-in account. Without this provider (device-only
// projects, the standalone practice page) no report button renders.
export function QuestionReportProvider({ project, store, children }: { project: Project; store: ReportStore; children: React.ReactNode }) {
  const [reports, setReports] = useState<Map<string, QuestionReport>>(() => new Map());
  useEffect(() => {
    let live = true;
    setReports(new Map());
    // A failed load leaves the buttons usable; a save shows its own error.
    store.load(project.id).then(rows => { if (live) setReports(new Map(rows.map(r => [r.item_id, r]))); }).catch(() => {});
    return () => { live = false; };
  }, [project.id, store]);
  const links = useMemo(() => linkAttemptsToExams(project), [project.examHistory, project.savedExams, project.activeExam]);
  const value = useMemo<Reports>(() => {
    const resolve = (t: Target) => {
      const attemptId = t.where === 'results' ? project.activeExam.attemptId || null : t.attemptId || null;
      const examId = t.where === 'results' ? project.activeExam.examId || null : (attemptId && links.get(attemptId)) || null;
      const examTitle = (project.savedExams || []).find(e => e.examId === examId)?.title || (t.where === 'results' ? project.activeExam.title || null : null);
      return { question: t.question, where: t.where, selectedOption: t.selectedOption, attemptId, examId, examTitle };
    };
    return {
      find: t => reports.get(reportItemId(t.question, resolve(t).examId)),
      save: async (t, comment) => {
        const row = await store.save(buildReportRow(project.id, resolve(t), comment));
        setReports(current => new Map(current).set(row.item_id, row));
      },
      remove: async t => {
        const itemId = reportItemId(t.question, resolve(t).examId);
        await store.remove(project.id, itemId);
        setReports(current => { const next = new Map(current); next.delete(itemId); return next; });
      },
    };
  }, [reports, links, project, store]);
  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function QuestionReportScope({ enabled, project, store, children }: { enabled: boolean; project: Project; store: ReportStore; children: React.ReactNode }) {
  return enabled ? <QuestionReportProvider project={project} store={store}>{children}</QuestionReportProvider> : <>{children}</>;
}

// A pill beside the tutor controls; the comment box opens full width below.
export function ReportQuestionButton({ question, where, selectedOption, attemptId }: Target) {
  const reports = useContext(ReportContext);
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!reports) return null;
  const target = { question, where, selectedOption, attemptId };
  const existing = reports.find(target);
  const id = `report-${where}-${question.metadata.itemId || question.id}`.replace(/[^A-Za-z0-9_-]/g, '-');
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await action(); setOpen(false); }
    catch (e) { setError(`Couldn't save: ${(e as Error).message}. Check you're signed in and online, then try again.`); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" aria-expanded={open} aria-controls={id}
      onClick={() => { if (!open) setComment(existing?.comment || ''); setOpen(!open); setError(''); }}
      className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border shadow-sm transition-colors print:hidden ${existing ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
      {existing ? <CheckCircle2 className="w-3 h-3" /> : <MessageSquareWarning className="w-3 h-3" />}
      {existing ? 'Marked for review' : 'Report a problem'}
    </button>
    {open && <div id={id} className="w-full basis-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm print:hidden">
      <label htmlFor={`${id}-comment`} className="font-medium text-slate-800">What looks wrong? <span className="font-normal text-slate-500">Optional</span></label>
      <textarea id={`${id}-comment`} rows={3} maxLength={MAX_REPORT_COMMENT} value={comment} onChange={e => setComment(e.target.value)}
        placeholder="For example: two answers work, the key looks wrong, a typo"
        className="mt-2 w-full rounded-md border border-slate-300 bg-white p-2 text-sm" />
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="action-primary" disabled={busy} onClick={() => run(() => reports.save(target, comment))}>{existing ? 'Save comment' : 'Mark for review'}</button>
        {existing && <button type="button" className="action-secondary" disabled={busy} onClick={() => run(() => reports.remove(target))}>Remove mark</button>}
        <button type="button" className="action-quiet" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Saved to your account for Claude to review, with your answer and the answer key.</p>
    </div>}
  </>;
}
