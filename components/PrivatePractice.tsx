import React, { useEffect, useRef, useState } from 'react';
import QuestionCard from './QuestionCard';
import {
  STORAGE_KEY, MAX_IMPORT_BYTES, emptyState, parseState, parseExam, parseBackup,
  backup, startAttempt, finishAttempt, recordAnswer, mergeBackup, score, remainingSeconds, saveState, examShare,
} from '../services/privatePractice';
import type { Answer, PracticeAttempt, PracticeExam, PracticeState } from '../services/privatePractice';

const unavailable = async () => { throw new Error('AI tools are unavailable in private practice.'); };
function download(value: unknown, name: string) {
  const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function load() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return { state: raw ? parseState(JSON.parse(raw)) : emptyState(), raw, error: '' };
  } catch (error) {
    return { state: emptyState(), raw, error: `Saved practice could not be read. It has not been overwritten. ${error instanceof Error ? error.message : ''}` };
  }
}
const stamp = (value: number) => new Date(value).toLocaleString();

export default function PrivatePractice() {
  const [boot] = useState(load);
  const [state, setState] = useState(boot.state);
  const stateRef = useRef(state);
  const [pending, setPending] = useState<PracticeExam | null>(null);
  const [sharing, setSharing] = useState<PracticeExam | null>(null);
  const [copied, setCopied] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(Boolean(boot.error));
  const [lockReady, setLockReady] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [filter, setFilter] = useState<'all' | 'incorrect' | 'flagged' | 'unanswered'>('all');
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const questionHeading = useRef<HTMLHeadingElement>(null);

  // One writer at a time. A revision check also detects stale data when Web Locks
  // are unavailable or storage changes after this page was loaded.
  useEffect(() => {
    let stopped = false, release: (() => void) | undefined;
    if (!navigator.locks) { setLockReady(true); return; }
    navigator.locks.request(STORAGE_KEY, { ifAvailable: true }, async lock => {
      if (stopped) return;
      if (!lock) {
        setBlocked(true); setError('Private practice is already open in another tab. Close that tab, then reload this page.');
        setLockReady(true); return;
      }
      setLockReady(true);
      await new Promise<void>(resolve => { release = resolve; if (stopped) resolve(); });
    }).catch(() => { if (!stopped) setLockReady(true); });
    return () => { stopped = true; release?.(); };
  }, []);
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setBlocked(true); setError('Saved practice changed in another tab. Export this copy if needed, then reload to use the saved version.');
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);
  useEffect(() => {
    if (!saveError) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveError]);

  function commit(update: (current: PracticeState) => PracticeState) {
    if (blocked || !lockReady) return;
    const previous = stateRef.current;
    let next: PracticeState;
    try { next = update(previous); } catch (e) { setError(e instanceof Error ? e.message : 'The change could not be applied.'); return; }
    if (next === previous) return;
    try {
      next = saveState(localStorage, next, previous.revision);
      setSaveError(''); setSavedAt(Date.now());
    } catch (e) {
      setSaveError(`Not saved on this browser. Your current answers are still on this page. Download a backup now. ${e instanceof Error ? e.message : ''}`);
    }
    stateRef.current = next; setState(next);
  }
  useEffect(() => {
    if (!state.active || blocked || !lockReady) return;
    const tick = () => {
      const time = Date.now(); setNow(time);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [state.active?.id, blocked, lockReady]);

  async function importFile(file: File | undefined, isBackup: boolean) {
    if (!file) return;
    setError('');
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('This file exceeds the 10 MB import limit.');
      const parsed: unknown = JSON.parse(await file.text());
      if (isBackup) {
        const incoming = parseBackup(parsed);
        // Validation and conflict checks finish before touching current state.
        const merged = mergeBackup(stateRef.current, incoming);
        commit(() => merged); setPending(null); setReviewId(null); setIndex(0);
      } else {
        if (stateRef.current.active) throw new Error('Finish the current exam before importing another.');
        setPending(parseExam(parsed)); setReviewId(null); setIndex(0);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'The file could not be imported.'); }
  }
  function start() {
    if (!pending) return;
    const time = Date.now();
    commit(s => startAttempt(s, pending, crypto.randomUUID(), time));
    setPending(null); setReviewId(null); setIndex(0); setFilter('all'); setNow(time);
  }
  function submit() {
    const current = stateRef.current.active;
    if (!current) return;
    setReviewId(current.id); setIndex(0); setFilter('all'); setConfirmSubmit(false);
    commit(s => finishAttempt(s, Date.now(), 'submitted'));
  }
  function toggleFlag(questionId: number) {
    commit(s => {
      if (!s.active) return s;
      const flags = s.active.flags.includes(questionId) ? s.active.flags.filter(id => id !== questionId) : [...s.active.flags, questionId];
      return { ...s, active: { ...s.active, flags } };
    });
  }
  function goTo(next: number) {
    setIndex(next);
    requestAnimationFrame(() => { questionHeading.current?.focus(); questionHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); });
  }

  const review = state.history.find(x => x.id === reviewId);
  const attempt = state.active || review;
  const isReview = Boolean(attempt?.completedAt);
  const all = attempt?.exam.questions || [];
  const visible = all.filter(q => filter === 'all' || (filter === 'flagged' ? attempt?.flags.includes(q.id) : filter === 'unanswered' ? !attempt?.answers[q.id] : Boolean(attempt?.answers[q.id]) && attempt?.answers[q.id] !== q.correctAnswer));
  const shownIndex = Math.min(index, Math.max(0, visible.length - 1));
  const question = visible[shownIndex];
  const stats = attempt ? score(attempt) : null;
  const seconds = state.active ? remainingSeconds(state.active, now) : 0;
  const disabled = blocked || !lockReady;
  const previouslySeen = new Set(state.history.flatMap(a => a.exam.questions.map(q => `${a.exam.registry.id}:${q.metadata.itemId}`)));
  const repeats = pending?.questions.filter(q => previouslySeen.has(`${pending.registry.id}:${q.metadata.itemId}`)).length || 0;
  const share = sharing ? examShare(sharing, window.location.href) : null;

  function openShare(exam: PracticeExam) { setSharing(exam); setCopied(false); }

  return <main className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-9">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <a href="/" className="text-xs font-bold uppercase tracking-widest text-blue-700">MedExam Generator</a>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Import & share exams</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Take the same exam with a friend. Each person has their own timer, answers and results. No account needed.</p>
      </div>
      <button className="practice-button" onClick={() => download(backup(stateRef.current), 'MedExam.practice-backup.json')}>Download backup</button>
    </header>

    <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
      Questions and progress stay in your browser. Use Share exam to send a question file to a friend. Download a backup for your own progress before switching devices or clearing browser data.
    </div>
    {boot.error && <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
      <p>{boot.error}</p>
      {boot.raw && <button className="practice-button mt-3" onClick={() => download(boot.raw!, 'MedExam-recovery.json')}>Download original saved data</button>}
    </div>}
    {error && <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">{error}</div>}
    {saveError ? <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
      <p>{saveError}</p><button className="practice-button mt-3" disabled={disabled} onClick={() => commit(s => ({ ...s }))}>Retry save</button>
    </div> : <p role="status" className="mb-4 text-xs text-slate-500">{savedAt ? `Saved on this browser at ${new Date(savedAt).toLocaleTimeString()}` : state.active || state.history.length ? 'Saved practice loaded from this browser' : pending ? 'Exam ready — timer has not started' : 'Ready for an exam file'}</p>}

    {sharing && share && <section role="dialog" aria-modal="false" aria-labelledby="share-title" className="practice-panel mb-6 border-blue-300">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="share-title" className="text-xl font-bold">Share exam with a friend</h2><button className="practice-button" onClick={() => setSharing(null)}>Close sharing</button></div>
      <p className="mt-3 text-sm text-slate-600">Send the exam file and the message below. The file includes the questions and grading key; the app hides explanations until submission. Your chosen answers, flags and history are not included.</p>
      <button className="practice-primary mt-4" onClick={() => download(share.contents, share.filename)}>Download exam to share</button>
      <label htmlFor="share-message" className="mt-4 block text-sm font-semibold">Message for your friend</label>
      <textarea id="share-message" readOnly rows={5} value={share.message} className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm" />
      <button className="practice-button mt-3" onClick={async () => { try { await navigator.clipboard.writeText(share.message); setCopied(true); } catch { setCopied(false); setError('Copy is unavailable here. Select and copy the message above.'); } }}>{copied ? 'Message copied' : 'Copy message'}</button>
    </section>}

    {!state.active && <section className="practice-panel mb-6">
      <div className="flex flex-wrap gap-3">
        <button className="practice-primary" disabled={disabled} onClick={() => fileInput.current?.click()}>Import exam</button>
        <button className="practice-button" disabled={disabled} onClick={() => backupInput.current?.click()}>Restore backup</button>
      </div>
      <input ref={fileInput} type="file" accept=".json" aria-label="Choose exam file" className="sr-only" onChange={e => { void importFile(e.target.files?.[0], false); e.target.value = ''; }} />
      <input ref={backupInput} type="file" accept=".json" aria-label="Choose backup file" className="sr-only" onChange={e => { void importFile(e.target.files?.[0], true); e.target.value = ''; }} />
      <p className="mt-3 text-sm text-slate-500">Use a .exam.json file. Importing another exam keeps completed attempts. Restoring a backup adds its history.</p>
      {pending && <div className="mt-5 border-t border-slate-200 pt-5">
        <h2 className="text-xl font-bold">{pending.title}</h2>
        <p className="mt-2 font-semibold">{pending.questions.length} questions · {pending.durationMinutes} minutes</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{pending.instructions}</p>
        {repeats > 0 && <p className="mt-3 text-sm text-amber-800">You have already completed {repeats} of these items. This will be a repeat attempt.</p>}
        <p className="mt-3 text-sm text-slate-600">The timer is a pacing guide. Keep answering after it reaches zero; answers appear only when you finish the exam.</p>
        <div className="mt-4 flex flex-wrap gap-3"><button className="practice-primary" disabled={disabled} onClick={start}>Start exam</button><button className="practice-button" onClick={() => openShare(pending)}>Share exam</button></div>
      </div>}
    </section>}

    {attempt && <>
      <section className="practice-panel mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-xl font-bold">{attempt.exam.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{isReview ? `Completed ${stamp(attempt.completedAt!)}` : `${stats!.answered} of ${stats!.total} answered · ${attempt.flags.length} flagged`}</p></div>
          {state.active ? <div className="text-right"><p className={`text-3xl font-bold tabular-nums ${seconds < 300 ? 'text-red-700' : 'text-blue-800'}`} aria-label="Time remaining">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p><p className="text-xs text-slate-500">remaining</p></div> : <div className="text-right"><p className="text-3xl font-bold text-blue-800">{stats!.correct}/{stats!.total}</p><p className="text-sm">{stats!.percent}% · {stats!.skipped} unanswered</p></div>}
        </div>
        {attempt.reason === 'time-expired' && <p className="mt-3 text-sm text-amber-800">Time expired. The answers saved by the deadline were submitted.</p>}
        {state.active && seconds === 0 && <p className="mt-3 text-sm text-amber-800" role="status">Suggested time reached. Keep answering at your own pace; finish the exam when you are ready.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium" htmlFor="question-filter">Show</label>
          <select id="question-filter" value={filter} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" onChange={e => { setFilter(e.target.value as typeof filter); setIndex(0); }}>
            <option value="all">All questions</option><option value="unanswered">Unanswered</option><option value="flagged">Flagged</option>{isReview && <option value="incorrect">Incorrect (answered)</option>}
          </select>
          <button className="practice-button" onClick={() => openShare(attempt.exam)}>Share exam</button>
          {state.active && <button className="practice-button ml-auto" disabled={disabled} onClick={() => setConfirmSubmit(true)}>Finish exam</button>}
        </div>
        {confirmSubmit && <div role="alert" className="mt-4 rounded-lg bg-amber-50 p-4">
          <p>Submit this attempt with {stats!.skipped} unanswered and {attempt.flags.length} flagged? You can review the explanations afterwards.</p>
          <div className="mt-3 flex gap-3"><button className="practice-primary" disabled={disabled} onClick={submit}>Submit answers</button><button className="practice-button" onClick={() => setConfirmSubmit(false)}>Keep working</button></div>
        </div>}
      </section>
      <div className="grid gap-5 lg:grid-cols-[1fr_210px]">
        <section className="min-w-0">
          <h2 ref={questionHeading} tabIndex={-1} className="mb-3 text-sm font-semibold text-slate-600">{isReview ? 'Review' : 'Exam'} · {visible.length} {filter === 'all' ? 'questions' : `${filter} questions`}</h2>
          {question ? <>
            <QuestionCard key={`${attempt.id}:${question.id}`} question={question} index={all.indexOf(question)} selectedOption={attempt.answers[question.id] || null}
              isFlagged={attempt.flags.includes(question.id)} isSubmitted={isReview} privatePractice interactionDisabled={disabled}
              onSelectOption={value => !disabled && commit(s => recordAnswer(s, question.id, value as Answer, Date.now()))}
              onToggleFlag={() => !disabled && toggleFlag(question.id)} onDeepDive={unavailable} onChatSend={unavailable} />
            {!isReview && <button className="mb-5 text-sm font-semibold text-slate-500 underline" disabled={disabled || !attempt.answers[question.id]} onClick={() => commit(s => recordAnswer(s, question.id, null, Date.now()))}>Clear answer</button>}
            {isReview && <div className="practice-panel mb-5 text-sm">
              <h3 className="font-semibold">{attempt.exam.registry.buckets[question.metadata.bucketId]} · {attempt.exam.registry.topics[question.metadata.topicId].title}</h3>
              <p className="mt-2 text-slate-600">Objective IDs: {question.metadata.objectiveIds.join(', ')}</p>
              <p className="mt-1 text-xs text-slate-500">{question.metadata.itemId} · {attempt.flags.includes(question.id) ? 'Flagged during exam' : 'Not flagged'}</p>
              <ul className="mt-3 space-y-2 text-xs text-slate-600">{question.metadata.sources?.map((s, i) => <li key={i}>{s.url ? <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}{s.page ? `, page ${s.page}` : ''}{s.accessed ? ` · checked ${s.accessed}` : ''}</li>)}</ul>
            </div>}
          </> : <div className="practice-panel mb-5">No questions match this filter.</div>}
          <div className="mb-6 flex justify-between gap-3"><button className="practice-button" disabled={shownIndex <= 0} onClick={() => goTo(shownIndex - 1)}>Previous</button><button className="practice-button" disabled={shownIndex >= visible.length - 1} onClick={() => goTo(shownIndex + 1)}>Next</button></div>
        </section>
        <nav aria-label="Question navigation" className="practice-panel self-start">
          <p className="mb-3 text-sm font-semibold">Jump to a question</p>
          <div className="grid grid-cols-5 gap-2">{all.map((q, i) => <button key={q.id} className={`rounded-md border px-1 py-2 text-sm ${question?.id === q.id ? 'border-blue-800 ring-2 ring-blue-600' : 'border-slate-200'} ${attempt.answers[q.id] ? 'bg-blue-100 text-blue-900' : 'bg-white'} ${attempt.flags.includes(q.id) ? 'font-bold text-orange-700' : ''}`} aria-label={`Question ${i + 1}${attempt.answers[q.id] ? ', answered' : ', unanswered'}${attempt.flags.includes(q.id) ? ', flagged' : ''}`} onClick={() => { setFilter('all'); goTo(i); }}>{i + 1}{attempt.flags.includes(q.id) ? '*' : ''}</button>)}</div>
          <p className="mt-3 text-xs text-slate-500">Blue: answered · *: flagged</p>
        </nav>
      </div>
      {isReview && <BucketSummary attempt={attempt} />}
    </>}

    <section className="practice-panel mt-6">
      <h2 className="text-lg font-bold">Completed attempts</h2>
      <p className="mt-1 text-sm text-slate-500">Practice results are observations, not mastery labels. Unanswered items count toward the exam score and are shown separately.</p>
      {!state.history.length ? <p className="mt-4 text-sm text-slate-500">Your finished exams will appear here.</p> : <ul className="mt-4 divide-y divide-slate-100">{[...state.history].reverse().map(a => {
        const s = score(a);
        return <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{a.exam.title}</p><p className="text-xs text-slate-500">{stamp(a.completedAt!)} · {s.correct}/{s.total} · {s.skipped} unanswered</p></div><div className="flex flex-wrap gap-2"><button className="practice-button" onClick={() => openShare(a.exam)}>Share exam</button><button className="practice-button" disabled={Boolean(state.active)} onClick={() => { setReviewId(a.id); setPending(null); setIndex(0); setFilter('all'); }}>Review attempt</button></div></li>;
      })}</ul>}
    </section>
  </main>;
}

function BucketSummary({ attempt }: { attempt: PracticeAttempt }) {
  const buckets = new Map<string, { title: string; total: number; answered: number; correct: number }>();
  for (const q of attempt.exam.questions) {
    const key = q.metadata.bucketId;
    const row = buckets.get(key) || { title: attempt.exam.registry.buckets[key], total: 0, answered: 0, correct: 0 };
    row.total++; if (attempt.answers[q.id]) row.answered++;
    if (attempt.answers[q.id] === q.correctAnswer) row.correct++;
    buckets.set(key, row);
  }
  return <section className="practice-panel mb-6"><h2 className="text-lg font-bold">This attempt by study bucket</h2><p className="mt-1 text-sm text-slate-500">Small samples guide what to review; they do not establish topic mastery.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200"><th className="py-2 pr-4">Bucket</th><th className="px-2 py-2">Correct / answered</th><th className="px-2 py-2">Unanswered</th></tr></thead><tbody>{[...buckets].map(([key, row]) => <tr className="border-b border-slate-100" key={key}><td className="py-3 pr-4">{row.title}</td><td className="px-2 py-3">{row.correct} / {row.answered}</td><td className="px-2 py-3">{row.total - row.answered}</td></tr>)}</tbody></table></div></section>;
}
