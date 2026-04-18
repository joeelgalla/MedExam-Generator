import { ExamAttempt, ExamQuestion, PracticeMode } from '../types';

// --- Tunables (kept here so the dashboard, generator, and prompt all agree) ---

export const PRACTICE_MODE_UNLOCKS: Record<PracticeMode, number> = {
  balanced: 0,
  focused: 20,
  targeted: 50,
};

// An LO must have at least this many attempts before we'll call it weak or mastered.
const MIN_LO_SAMPLE = 3;

// Last-N attempts on an LO used to judge current mastery state.
const MASTERY_WINDOW = 3;

// Accuracy threshold over the mastery window required to consider an LO "mastered".
const MASTERY_THRESHOLD = 0.85;

// Below this accuracy and an LO is considered weak (must also clear MIN_LO_SAMPLE).
const WEAK_THRESHOLD = 0.6;

// Re-surface a mastered LO after this many subsequent answered questions.
// Doubles on each successful maintenance answer (Anki-style expanding interval),
// capped to MAINTENANCE_INTERVAL_MAX.
const MAINTENANCE_BASE_INTERVAL = 20;
const MAINTENANCE_INTERVAL_MAX = 200;

// Hard caps on what we ask the model to receive — keeps the prompt small.
const MAX_WEAK_LOS_IN_PROMPT = 8;
const MAX_STRONG_LOS_IN_PROMPT = 8;
const MAX_MAINTENANCE_LOS_IN_PROMPT = 4;
const MAX_RECENT_WRONG_STEMS = 5;

// --- Types ---

export interface PracticeModeUnlocks {
  focused: { unlocked: boolean; required: number; remaining: number };
  targeted: { unlocked: boolean; required: number; remaining: number };
}

interface LoEvent {
  globalIdx: number; // index across all events in chronological order
  isCorrect: boolean;
  isMaintenance: boolean;
}

interface LoStat {
  lo: string;
  totalAttempts: number;
  totalCorrect: number;
  recentCorrect: number; // correct count over last MASTERY_WINDOW attempts
  recentTotal: number;
  accuracy: number; // 0..1 over all attempts
  recentAccuracy: number; // 0..1 over last MASTERY_WINDOW attempts
  mastered: boolean;
  weak: boolean;
  lastEventGlobalIdx: number;
  maintenanceStreak: number; // consecutive correct maintenance answers at the tail
  questionsSinceLastSeen: number; // count of subsequent answered questions on any LO
  currentInterval: number; // questions between maintenance re-surfaces for this LO
  dueForMaintenance: boolean;
}

export interface PracticeModeContext {
  totalAnswered: number;
  loStats: LoStat[]; // sorted: weakest first, then alphabetical
  weakLos: string[];
  strongLos: string[];
  maintenanceLos: string[]; // mastered LOs whose interval has elapsed
  recentWrongStems: string[]; // up to MAX_RECENT_WRONG_STEMS, newest first
}

// --- Public helpers ---

export function totalAnsweredQuestions(history: ExamAttempt[]): number {
  let n = 0;
  for (const attempt of history) n += attempt.questions.length;
  return n;
}

export function computeUnlocks(history: ExamAttempt[]): PracticeModeUnlocks {
  const total = totalAnsweredQuestions(history);
  const focusedReq = PRACTICE_MODE_UNLOCKS.focused;
  const targetedReq = PRACTICE_MODE_UNLOCKS.targeted;
  return {
    focused: {
      unlocked: total >= focusedReq,
      required: focusedReq,
      remaining: Math.max(0, focusedReq - total),
    },
    targeted: {
      unlocked: total >= targetedReq,
      required: targetedReq,
      remaining: Math.max(0, targetedReq - total),
    },
  };
}

export function isModeUnlocked(mode: PracticeMode, history: ExamAttempt[]): boolean {
  if (mode === 'balanced') return true;
  const unlocks = computeUnlocks(history);
  return mode === 'focused' ? unlocks.focused.unlocked : unlocks.targeted.unlocked;
}

// Highest-quality mode that's currently unlocked — used for fallback when a
// previously-selected mode lost its unlock (e.g. history was cleared).
export function highestUnlockedMode(history: ExamAttempt[]): PracticeMode {
  const u = computeUnlocks(history);
  if (u.targeted.unlocked) return 'targeted';
  if (u.focused.unlocked) return 'focused';
  return 'balanced';
}

export function buildPracticeModeContext(history: ExamAttempt[]): PracticeModeContext {
  // Sort attempts oldest-first so global indices are chronological.
  const ordered = [...history].sort((a, b) => a.date.localeCompare(b.date));

  const loToEvents = new Map<string, LoEvent[]>();
  const recentWrong: { date: string; question: ExamQuestion }[] = [];
  let globalIdx = 0;

  for (const attempt of ordered) {
    for (const q of attempt.questions) {
      const isCorrect = attempt.answers[q.id] === q.correctAnswer;
      const isMaintenance = q.metadata.isMaintenance === true;
      const ev: LoEvent = { globalIdx, isCorrect, isMaintenance };
      for (const raw of q.metadata.losTested || []) {
        const lo = raw.trim();
        if (!lo) continue;
        const arr = loToEvents.get(lo);
        if (arr) arr.push(ev); else loToEvents.set(lo, [ev]);
      }
      if (!isCorrect) recentWrong.push({ date: attempt.date, question: q });
      globalIdx += 1;
    }
  }

  const totalAnswered = globalIdx;

  const loStats: LoStat[] = [];
  for (const [lo, events] of loToEvents.entries()) {
    const totalAttempts = events.length;
    const totalCorrect = events.reduce((n, e) => n + (e.isCorrect ? 1 : 0), 0);
    const accuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

    const recentSlice = events.slice(-MASTERY_WINDOW);
    const recentTotal = recentSlice.length;
    const recentCorrect = recentSlice.reduce((n, e) => n + (e.isCorrect ? 1 : 0), 0);
    const recentAccuracy = recentTotal > 0 ? recentCorrect / recentTotal : 0;

    const meetsSample = totalAttempts >= MIN_LO_SAMPLE;
    const mastered = meetsSample && recentTotal >= MASTERY_WINDOW && recentAccuracy >= MASTERY_THRESHOLD;
    const weak = meetsSample && accuracy <= WEAK_THRESHOLD;

    let maintenanceStreak = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev.isMaintenance && ev.isCorrect) maintenanceStreak += 1;
      else break;
    }

    const lastEventGlobalIdx = events[events.length - 1].globalIdx;
    const questionsSinceLastSeen = Math.max(0, totalAnswered - 1 - lastEventGlobalIdx);
    const currentInterval = Math.min(
      MAINTENANCE_INTERVAL_MAX,
      MAINTENANCE_BASE_INTERVAL * Math.pow(2, maintenanceStreak),
    );
    const dueForMaintenance = mastered && questionsSinceLastSeen >= currentInterval;

    loStats.push({
      lo,
      totalAttempts,
      totalCorrect,
      recentCorrect,
      recentTotal,
      accuracy,
      recentAccuracy,
      mastered,
      weak,
      lastEventGlobalIdx,
      maintenanceStreak,
      questionsSinceLastSeen,
      currentInterval,
      dueForMaintenance,
    });
  }

  // Sort weakest first (lowest accuracy, ties broken by more attempts → stronger signal)
  loStats.sort((a, b) => {
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    return b.totalAttempts - a.totalAttempts;
  });

  const weakLos = loStats.filter(s => s.weak).map(s => s.lo).slice(0, MAX_WEAK_LOS_IN_PROMPT);

  // Strongest = highest accuracy mastered LOs. Take from the end of the sorted list.
  const strongLos = [...loStats]
    .filter(s => s.mastered)
    .sort((a, b) => b.accuracy - a.accuracy || b.totalAttempts - a.totalAttempts)
    .map(s => s.lo)
    .slice(0, MAX_STRONG_LOS_IN_PROMPT);

  // Maintenance: dueForMaintenance, prioritized by largest gap-vs-interval (most overdue first)
  const maintenanceLos = [...loStats]
    .filter(s => s.dueForMaintenance)
    .sort((a, b) => (b.questionsSinceLastSeen - b.currentInterval) - (a.questionsSinceLastSeen - a.currentInterval))
    .map(s => s.lo)
    .slice(0, MAX_MAINTENANCE_LOS_IN_PROMPT);

  // Recent wrong stems: newest first (we appended in chronological order).
  const recentWrongStems = recentWrong
    .reverse()
    .slice(0, MAX_RECENT_WRONG_STEMS)
    .map(({ question }) => truncate(question.vignette ? `${question.vignette}\n${question.leadIn}` : question.leadIn, 600));

  return { totalAnswered, loStats, weakLos, strongLos, maintenanceLos, recentWrongStems };
}

// Build the prompt fragment that tells the model how to bias question generation.
// Returns an empty string for balanced mode (or when there's no useful signal yet).
export function buildPracticeDirective(mode: PracticeMode, ctx: PracticeModeContext): string {
  if (mode === 'balanced') return '';
  if (ctx.weakLos.length === 0 && ctx.maintenanceLos.length === 0 && (mode !== 'targeted' || ctx.strongLos.length === 0)) {
    return '';
  }

  const lines: string[] = [];
  lines.push('**PART 3: PRACTICE MODE DIRECTIVE**');
  lines.push(
    'The user has completed prior practice exams. Use the per-LO history below to bias question selection. The directive only changes WHICH LOs to draw from — every other rule (cognitive-level mix, distractor homogeneity, JSON schema, vignette style) still applies.',
  );

  if (mode === 'focused') {
    lines.push('');
    lines.push('Mode: FOCUSED — keep coverage broad but skew the mix.');
    lines.push('- Give the WEAK LOs roughly 2× the share they would normally get from the blueprint.');
    lines.push('- Give the STRONG LOs roughly 0.5× their normal share.');
    lines.push('- Other LOs are unchanged.');
  } else {
    lines.push('');
    lines.push('Mode: TARGETED — drill weak material, skip what the user has already mastered.');
    lines.push('- Generate questions ONLY for the WEAK LOs and for any LO not yet attempted (untested LOs are fair game).');
    lines.push('- Do NOT generate questions for the STRONG LOs unless they appear in the MAINTENANCE list below.');
    lines.push('- Maintain blueprint section weights as best you can given the remaining LO pool.');
  }

  if (ctx.weakLos.length > 0) {
    lines.push('');
    lines.push('WEAK LOs (user has consistently missed these — emphasize):');
    ctx.weakLos.forEach(lo => lines.push(`  - ${lo}`));
  }

  if (ctx.strongLos.length > 0) {
    lines.push('');
    lines.push(mode === 'targeted'
      ? 'STRONG LOs (skip these unless listed under MAINTENANCE):'
      : 'STRONG LOs (de-emphasize these):');
    ctx.strongLos.forEach(lo => lines.push(`  - ${lo}`));
  }

  if (ctx.maintenanceLos.length > 0) {
    lines.push('');
    lines.push(`MAINTENANCE LOs (previously mastered, due for re-check — generate exactly ${ctx.maintenanceLos.length} question${ctx.maintenanceLos.length === 1 ? '' : 's'} covering these, one per LO):`);
    ctx.maintenanceLos.forEach(lo => lines.push(`  - ${lo}`));
    lines.push('For each maintenance question, set metadata.isMaintenance = true. Use a NEW clinical scenario — do not paraphrase prior stems. The maintenance count is INCLUDED in the total question count, not added on top.');
  }

  if (ctx.recentWrongStems.length > 0) {
    lines.push('');
    lines.push('RECENTLY MISSED stems (for inspiration only — do NOT reuse these stems verbatim; generate fresh scenarios on the same LOs):');
    ctx.recentWrongStems.forEach((stem, i) => {
      lines.push(`  [${i + 1}] ${stem.replace(/\n/g, ' ')}`);
    });
  }

  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}
