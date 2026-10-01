import type { ExamQuestion, QuestionMetadata } from '../types.ts';

export const STORAGE_KEY = 'medexam.private-practice.v1';
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export type Answer = 'A' | 'B' | 'C' | 'D';
export interface Registry {
  id: string;
  objectives: Record<string, { topicId: string; text?: string; assessmentType?: 'knowledge' | 'skill' }>;
  topics: Record<string, { title: string; bucketId: string }>;
  buckets: Record<string, string>;
}
export interface PracticeQuestion extends ExamQuestion {
  metadata: QuestionMetadata & { itemId: string; objectiveIds: string[]; topicId: string; bucketId: string };
}
export interface PracticeExam {
  format: 'medexam-practice'; version: 1; examId: string; title: string;
  contentRevision?: number;
  durationMinutes: number; instructions: string; registry: Registry;
  questions: PracticeQuestion[];
}
export interface PracticeAttempt {
  id: string; exam: PracticeExam; answers: Record<number, Answer>; flags: number[];
  startedAt: number; endsAt: number; completedAt?: number; reason?: 'submitted' | 'time-expired';
}
export interface PracticeState {
  version: 1; revision: number; active: PracticeAttempt | null; history: PracticeAttempt[];
}
export const emptyState = (): PracticeState => ({ version: 1, revision: 0, active: null, history: [] });

function fail(message: string): never { throw new Error(message); }
function object(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as Record<string, any>;
}
function text(value: unknown, label: string, max = 12000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) fail(`${label} must be non-empty text (maximum ${max} characters).`);
  return value;
}
function id(value: unknown, label: string): string {
  const result = text(value, label, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:#-]*$/.test(result) || ['constructor', 'prototype', '__proto__'].includes(result)) fail(`${label} is not a valid identifier.`);
  return result;
}
function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} is out of range.`);
  return value;
}
function integer(value: unknown, label: string, min: number, max: number): number {
  const n = number(value, label, min, max);
  if (!Number.isInteger(n)) fail(`${label} must be an integer.`);
  return n;
}
function array(value: unknown, label: string, min = 1, max = 500): any[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label} has an invalid number of entries.`);
  return value;
}
function unique<T>(values: T[], label: string): T[] {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicate identifiers.`);
  return values;
}
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function entries(value: unknown, label: string): [string, any][] {
  const result = Object.entries(object(value, label));
  if (result.length < 1 || result.length > 2000) fail(`${label} has an invalid number of entries.`);
  result.forEach(([key]) => id(key, label));
  return result;
}

export function parseExam(value: unknown): PracticeExam {
  const v = object(value, 'Exam');
  if (v.format !== 'medexam-practice' || v.version !== 1) fail('Choose a version 1 practice exam (.exam.json), not a cloud project export.');
  const r = object(v.registry, 'Objective registry');
  const buckets = Object.fromEntries(entries(r.buckets, 'Buckets').map(([key, title]) => [key, text(title, 'Bucket title', 250)]));
  const topics = Object.fromEntries(entries(r.topics, 'Topics').map(([key, value]) => {
    const topic = object(value, 'Topic');
    const bucketId = id(topic.bucketId, 'Topic bucket ID');
    if (!has(buckets, bucketId)) fail(`Unknown bucket ${bucketId}.`);
    return [key, { title: text(topic.title, 'Topic title', 250), bucketId }];
  }));
  const objectives = Object.fromEntries(entries(r.objectives, 'Objectives').map(([key, value]) => {
    const entry=object(value, 'Objective');
    const topicId = id(entry.topicId, 'Objective topic ID');
    if (!has(topics, topicId)) fail(`Unknown topic ${topicId}.`);
    if(entry.assessmentType!==undefined && !['knowledge','skill'].includes(entry.assessmentType))fail('Invalid objective assessment type.');
    return [key, { topicId, ...(entry.text ? {text:text(entry.text,'Objective text',5000)}:{}), ...(entry.assessmentType ? {assessmentType:entry.assessmentType as 'knowledge'|'skill'}:{}) }];
  }));
  const registry = { id: id(r.id, 'Registry ID'), buckets, topics, objectives };
  const questions: PracticeQuestion[] = array(v.questions, 'Questions', 1, 200).map((value, index) => {
    const q = object(value, `Question ${index + 1}`), m = object(q.metadata, 'Metadata');
    const topicId = id(m.topicId, 'Topic ID'), bucketId = id(m.bucketId, 'Bucket ID');
    if (!has(topics, topicId) || topics[topicId].bucketId !== bucketId) fail(`Question ${index + 1} has an unknown topic or mismatched bucket.`);
    const objectiveIds = unique(array(m.objectiveIds, 'Objective IDs', 1, 30).map(x => id(x, 'Objective ID')), 'Objective IDs');
    for (const key of objectiveIds) {
      if (!has(objectives, key) || objectives[key].topicId !== topicId) fail(`Question ${index + 1}: objective ${key} is absent from the registry or belongs to another topic.`);
    }
    const options = object(q.options, 'Options');
    if (!['A', 'B', 'C', 'D'].includes(q.correctAnswer)) fail(`Question ${index + 1} has an invalid answer key.`);
    if (!['1.1', '1.2', '1.3'].includes(m.cognitiveLevel)) fail('Invalid cognitive level.');
    const sources = m.sources === undefined ? undefined : array(m.sources, 'Sources', 0, 20).map(value => {
      const source = object(value, 'Source');
      if (source.url !== undefined && !/^https:\/\//.test(text(source.url, 'Source URL', 2000))) fail('Source links must use HTTPS.');
      if (source.url) { try { new URL(source.url); } catch { fail('Invalid source URL.'); } }
      return { title: text(source.title, 'Source title', 500),
        ...(source.page !== undefined ? { page: integer(source.page, 'Source page', 1, 100000) } : {}),
        ...(source.url ? { url: source.url as string } : {}),
        ...(source.accessed ? { accessed: text(source.accessed, 'Source date', 40) } : {}),
        ...(source.quote !== undefined ? { quote:text(source.quote,'Source passage',4000) } : {}), ...(source.kind==='supplement'?{kind:'supplement' as const}:{}) };
    });
    return {
      id: integer(q.id, 'Question ID', 1, 1000000),
      vignette: text(q.vignette, 'Vignette'), leadIn: text(q.leadIn, 'Lead-in', 3000),
      options: Object.fromEntries(['A', 'B', 'C', 'D'].map(key => [key, text(options[key], `Option ${key}`, 3000)])) as ExamQuestion['options'],
      correctAnswer: q.correctAnswer as Answer, explanation: text(q.explanation, 'Explanation'),
      metadata: { losTested: array(m.losTested, 'Learning objectives', 1, 30).map(x => text(x, 'Learning objective', 3000)),
        cluster: text(m.cluster, 'Cluster', 250), cognitiveLevel: m.cognitiveLevel,
        subtype: text(m.subtype, 'Question subtype', 80) as QuestionMetadata['subtype'],
        week: m.week === undefined ? 0 : integer(m.week, 'Week', 0, 1000),
        itemId: id(m.itemId, 'Item ID'), objectiveIds, topicId, bucketId,
        ...(m.caseId ? { caseId: id(m.caseId, 'Case ID') } : {}),
        ...(m.sourceDocument ? { sourceDocument: text(m.sourceDocument, 'Source document', 500) } : {}),
        ...(sources ? { sources } : {}),
        ...(m.coverageNote ? {coverageNote:text(m.coverageNote,'Objective task',2000)}:{}), ...(m.rechecksItemId ? {rechecksItemId:text(m.rechecksItemId,'Recheck item ID',250)}:{}) },
    };
  });
  unique(questions.map(q => q.id), 'Questions');
  unique(questions.map(q => q.metadata.itemId), 'Items');
  return { format: 'medexam-practice', version: 1, examId: id(v.examId, 'Exam ID'),
    ...(v.contentRevision===undefined?{}:{contentRevision:integer(v.contentRevision,'Content revision',1,1000000)}),
    title: text(v.title, 'Exam title', 250), durationMinutes: integer(v.durationMinutes, 'Duration (minutes)', 1, 240),
    instructions: text(v.instructions, 'Instructions', 5000), registry, questions };
}

// An exam share contains the question bank and grading key, never a learner's
// answers, timer, flags or attempt history. Re-parse to allowlist every field.
export function examShare(value: unknown, playerUrl: string) {
  const exam = parseExam(value);
  const url = new URL(playerUrl);
  url.pathname = '/practice.html'; url.search = ''; url.hash = '';
  return {
    filename: `${exam.examId}.exam.json`,
    contents: JSON.stringify(exam, null, 2),
    message: `Let's try ${exam.title} (${exam.questions.length} questions, ${exam.durationMinutes} minutes).\nOpen ${url.href}\nClick Import exam and choose the attached ${exam.examId}.exam.json file. Start when you're ready; we each get our own timer, answers and results.`,
  };
}

function parseAttempt(value: unknown, completed: boolean): PracticeAttempt {
  const v = object(value, 'Attempt'), exam = parseExam(v.exam);
  const keys = new Set(exam.questions.map(q => String(q.id)));
  const answers: Record<number, Answer> = {};
  for (const [key, value] of Object.entries(object(v.answers, 'Answers'))) {
    if (!keys.has(key) || !['A', 'B', 'C', 'D'].includes(value as string)) fail('Invalid saved answer.');
    answers[Number(key)] = value as Answer;
  }
  const flags = unique(array(v.flags, 'Flags', 0, 200).map(x => integer(x, 'Flagged question ID', 1, 1000000)), 'Flags');
  if (flags.some(x => !keys.has(String(x)))) fail('A saved flag refers to an unknown question.');
  const startedAt = integer(v.startedAt, 'Start time', 1, 1e14);
  const endsAt = integer(v.endsAt, 'End time', startedAt, 1e14);
  if (endsAt - startedAt !== exam.durationMinutes * 60000) fail('The saved timer does not match the exam duration.');
  const result: PracticeAttempt = { id: id(v.id, 'Attempt ID'), exam, answers, flags, startedAt, endsAt };
  if (completed) {
    result.completedAt = integer(v.completedAt, 'Completion time', startedAt, endsAt);
    if (v.reason !== 'submitted' && v.reason !== 'time-expired') fail('Invalid completion reason.');
    result.reason = v.reason;
  } else if (v.completedAt !== undefined || v.reason !== undefined) fail('An active attempt cannot already be completed.');
  return result;
}
export function parseState(value: unknown): PracticeState {
  const v = object(value, 'Practice backup');
  if (v.version !== 1) fail('Unsupported practice backup version.');
  const history = array(v.history, 'History', 0, 500).map(x => parseAttempt(x, true));
  const active = v.active === null ? null : parseAttempt(v.active, false);
  unique([...history.map(x => x.id), ...(active ? [active.id] : [])], 'Attempts');
  return { version: 1, revision: integer(v.revision, 'Revision', 0, Number.MAX_SAFE_INTEGER), active, history };
}
export function parseBackup(value: unknown): PracticeState {
  const v = object(value, 'Backup');
  if (v.format !== 'medexam-practice-backup' || v.version !== 1) fail('Choose a private practice backup (.practice-backup.json).');
  return parseState(v.state);
}
export function backup(state: PracticeState) {
  return { format: 'medexam-practice-backup', version: 1, exportedAt: new Date().toISOString(), state };
}
export function startAttempt(state: PracticeState, exam: PracticeExam, attemptId: string, now: number): PracticeState {
  if (state.active) fail('Finish the current exam before starting another.');
  return { ...state, active: { id: attemptId, exam, answers: {}, flags: [], startedAt: now, endsAt: now + exam.durationMinutes * 60000 } };
}
export function finishAttempt(state: PracticeState, now: number, reason: PracticeAttempt['reason']): PracticeState {
  if (!state.active) return state;
  const active = state.active;
  const finished: PracticeAttempt = { ...active, completedAt: Math.max(active.startedAt, Math.min(now, active.endsAt)), reason: now >= active.endsAt ? 'time-expired' : reason };
  return { ...state, active: null, history: [...state.history, finished] };
}
export function recordAnswer(state: PracticeState, questionId: number, answer: Answer | null, now: number): PracticeState {
  const a = state.active;
  if (!a) return state;
  if (now >= a.endsAt) return finishAttempt(state, now, 'time-expired');
  if (!a.exam.questions.some(q => q.id === questionId)) fail('Unknown question.');
  const answers = { ...a.answers };
  if (answer === null) delete answers[questionId]; else answers[questionId] = answer;
  return { ...state, active: { ...a, answers } };
}
export function mergeBackup(current: PracticeState, incoming: PracticeState): PracticeState {
  if (current.active) fail('Finish your current exam before restoring a backup. Your answers have not been replaced.');
  const history = new Map(current.history.map(x => [x.id, x]));
  for (const attempt of incoming.history) {
    const existing = history.get(attempt.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(attempt)) fail('A backup attempt conflicts with existing history. Export both copies before resolving it.');
    history.set(attempt.id, attempt);
  }
  // A completed local attempt must not be revived by an older backup.
  const active = incoming.active && !history.has(incoming.active.id) ? incoming.active : null;
  return { ...current, history: [...history.values()], active };
}
export function score(attempt: PracticeAttempt) {
  const total = attempt.exam.questions.length;
  const answered = attempt.exam.questions.filter(q => attempt.answers[q.id]).length;
  const correct = attempt.exam.questions.filter(q => attempt.answers[q.id] === q.correctAnswer).length;
  return { total, answered, correct, skipped: total - answered, percent: Math.round(100 * correct / total) };
}
export function remainingSeconds(attempt: PracticeAttempt, now: number): number {
  return Math.max(0, Math.ceil((attempt.endsAt - now) / 1000));
}
export function saveState(storage: Pick<Storage, 'getItem' | 'setItem'>, state: PracticeState, expectedRevision: number): PracticeState {
  const saved = storage.getItem(STORAGE_KEY);
  const revision = saved === null ? 0 : parseState(JSON.parse(saved)).revision;
  if (revision !== expectedRevision) fail('Another tab changed your saved practice. Export this copy, then reload before continuing.');
  const next = { ...state, revision: revision + 1 };
  storage.setItem(STORAGE_KEY, JSON.stringify(next)); // Caller must show quota/security failures; never swallow.
  return next;
}
