import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.ts';
import { aiDisabled } from '../lib/server/aiPolicy.ts';
import { STORAGE_KEY, parseExam, emptyState, parseState, parseBackup, backup, startAttempt, finishAttempt, recordAnswer, mergeBackup, score, remainingSeconds, saveState } from '../services/privatePractice.ts';
import type { PracticeState } from '../services/privatePractice.ts';

const started = () => startAttempt(emptyState(), parseExam(fixture()), 'attempt-1', 100000);
const completed = () => finishAttempt(recordAnswer(started(), 1, 'B', 100010), 100020, 'submitted');
const fakeStorage = () => {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
};

test('exam import validates exact registry row IDs and normalizes legacy metadata', () => {
  const e = parseExam(fixture());
  assert.equal(e.questions.length, 3);
  assert.deepEqual(e.questions[0].metadata.objectiveIds, ['DEMO.1#1']);
  assert.equal(e.questions[0].metadata.week, 0);
});
test('an ambiguous source ID cannot substitute for a unique row ID', () => {
  const e = fixture(); e.questions[0].metadata.objectiveIds = ['DEMO.1'];
  assert.throws(() => parseExam(e), /absent from the registry/);
});
test('invalid imports cannot silently enter state', () => {
  for (const mutate of [
    (e: any) => e.questions[1].id = 1,
    (e: any) => e.questions[1].metadata.itemId = 'demo-item-1',
    (e: any) => e.questions[0].correctAnswer = 'E',
    (e: any) => e.questions[0].options.A = 1,
    (e: any) => e.questions[0].metadata.bucketId = 'missing',
    (e: any) => e.registry.objectives['DEMO.1#1'].topicId = 'missing',
    (e: any) => e.questions[0].metadata.itemId = '__proto__',
    (e: any) => e.durationMinutes = 0,
    (e: any) => e.questions[0].metadata.sources = [{ title: 'Unsafe', url: 'javascript:alert(1)' }],
  ]) { const e = fixture(); mutate(e); assert.throws(() => parseExam(e)); }
});
test('an objective from a different topic is rejected even when present in the catalog', () => {
  const e: any = fixture(); e.registry.topics.other = { title: 'Other', bucketId: 'basics' };
  e.registry.objectives['DEMO.1#1'].topicId = 'other';
  assert.throws(() => parseExam(e), /belongs to another topic/);
});
test('new exams retain previous history and refuse to replace an active attempt', () => {
  const s = completed(), next = startAttempt(s, parseExam(fixture()), 'attempt-2', 200000);
  assert.equal(next.history.length, 1); assert.deepEqual(next.history, s.history);
  assert.throws(() => startAttempt(next, parseExam(fixture()), 'attempt-3', 210000), /Finish the current/);
});
test('a full 60-question, 90-minute mock imports without the generator slider cap', () => {
  const e = fixture(); e.durationMinutes = 90;
  e.questions = Array.from({ length: 60 }, (_, i) => ({ ...e.questions[0], id: i + 1, metadata: { ...e.questions[0].metadata, itemId: `full-demo-${i + 1}` } }));
  const parsed = parseExam(e), s = startAttempt(emptyState(), parsed, 'full-demo', 100000);
  assert.equal(parsed.questions.length, 60);
  assert.equal(remainingSeconds(s.active!, 100000), 5400);
});
test('answers and flags round-trip through the persisted backup', () => {
  const s = recordAnswer(started(), 2, 'C', 100010);
  s.active!.flags = [2];
  assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(backup(s)))), s);
});
test('clearing an answer does not count it as answered', () => {
  const s = recordAnswer(recordAnswer(started(), 2, 'C', 100010), 2, null, 100011);
  assert.equal(score(s.active!).answered, 0);
});
test('absolute deadline survives time away and never accepts a late answer', () => {
  const s = started();
  assert.equal(remainingSeconds(s.active!, 115000), 45);
  const restored = parseState(JSON.parse(JSON.stringify(s)));
  const expired = recordAnswer(restored, 1, 'B', 160001);
  assert.equal(expired.active, null);
  assert.deepEqual(expired.history[0].answers, {});
  assert.equal(expired.history[0].reason, 'time-expired');
  assert.equal(expired.history[0].completedAt, 160000);
});
test('completion is idempotent and retains flags', () => {
  const s = started(); s.active!.flags = [1, 3];
  const end = finishAttempt(s, 120000, 'submitted');
  assert.deepEqual(finishAttempt(end, 130000, 'submitted'), end);
  assert.deepEqual(end.history[0].flags, [1, 3]);
});
test('unanswered questions are separate from wrong answered questions', () => {
  const s = recordAnswer(recordAnswer(started(), 1, 'B', 100010), 2, 'A', 100020);
  assert.deepEqual(score(s.active!), { total: 3, answered: 2, correct: 1, skipped: 1, percent: 33 });
});
test('backup merge is additive, deduplicates identical attempts and preserves current history', () => {
  const s = completed();
  assert.deepEqual(mergeBackup(s, parseBackup(backup(s))).history, s.history);
  const incoming = completed(); incoming.history[0].id = 'attempt-2';
  assert.equal(mergeBackup(s, incoming).history.length, 2);
});
test('backup merge refuses conflicting history and active overwrites', () => {
  const s = completed(), incoming = completed(); incoming.history[0].answers[1] = 'D';
  assert.throws(() => mergeBackup(s, incoming), /conflicts/);
  assert.throws(() => mergeBackup(started(), s), /Finish your current/);
});
test('an older backup never revives a completed attempt', () => {
  assert.equal(mergeBackup(completed(), started()).active, null);
});
test('malformed backup answers, flags and timer are rejected', () => {
  for (const mutate of [
    (s: any) => s.active.answers[99] = 'A',
    (s: any) => s.active.flags = [99],
    (s: any) => s.active.endsAt += 1,
    (s: any) => s.active.completedAt = 120000,
    (s: any) => s.revision = -1,
  ]) { const s = started(); mutate(s); assert.throws(() => parseState(s)); }
});
test('storage success advances the revision without modifying the input', () => {
  const storage = fakeStorage(), s = started();
  const next = saveState(storage, s, 0);
  assert.equal(next.revision, 1); assert.equal(s.revision, 0);
  assert.deepEqual(parseState(JSON.parse(storage.getItem(STORAGE_KEY)!)), next);
});
test('a stale tab cannot replace newer saved answers', () => {
  const storage = fakeStorage(); const s = saveState(storage, started(), 0);
  const newAnswers = saveState(storage, recordAnswer(s, 1, 'B', 100010), 1);
  assert.throws(() => saveState(storage, s, 1), /Another tab/);
  assert.deepEqual(parseState(JSON.parse(storage.getItem(STORAGE_KEY)!)), newAnswers);
});
test('corrupt storage is retained and quota errors propagate to the UI', () => {
  const storage = fakeStorage(); storage.setItem(STORAGE_KEY, '{bad');
  assert.throws(() => saveState(storage, emptyState(), 0));
  assert.equal(storage.getItem(STORAGE_KEY), '{bad');
  assert.throws(() => saveState({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } }, started(), 0), /QuotaExceeded/);
});
test('preview AI calls are always disabled, including when an override tries to enable them', () => {
  assert.equal(aiDisabled({ VERCEL_ENV: 'preview', DISABLE_AI: '0' }), true);
  assert.equal(aiDisabled({ VERCEL_ENV: 'production', DISABLE_AI: '1' }), true);
  assert.equal(aiDisabled({ VERCEL_ENV: 'production' }), false);
});

// Compile-time backward compatibility: the original cloud question shape needs
// none of the new metadata. No existing project or Supabase record is read.
test('legacy question metadata remains valid', () => {
  const old = { ...parseExam(fixture()).questions[0] };
  const { itemId, objectiveIds, topicId, bucketId, ...legacy } = old.metadata;
  const question: import('../types.ts').ExamQuestion = { ...old, metadata: legacy };
  assert.equal(question.metadata.week, 0);
  assert.equal(question.metadata.itemId, undefined);
});
