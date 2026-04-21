# Changes

Running log of non-trivial changes to MedExam-Generator. Newest first.

## 2026-04-20 (evening) — Tutor panel refactor: Deep Dive + chat in Review Questions tab

Bug report from live testing: Deep Dive and AI Tutor chat worked in post-submit review right after completing an exam, but were missing from the **Review Questions** tab in the Analytics Dashboard. The Review tab renders its own custom row markup (not via `QuestionCard`), so it never received the new tutor UI.

### Extraction: `components/QuestionTutorPanel.tsx`
- Pulled the Deep Dive button + result + chat panel + "Ask about this" selection popup out of `QuestionCard` into a shared component.
- Self-contained: owns `deepDiveContent`, `chatMessages`, `chatInput`, `isSending`, `selectionPopup` state plus `chatPanelRef` for selection exclusion.
- Accepts a `contentRef: React.RefObject<HTMLElement | null>` from the parent — scope for "Ask about this" detection. The panel attaches a `mouseup` listener to that ref in `useEffect` and cleans up on unmount.
- Selection popup switched from absolute-positioned (relative to container) to `position: fixed` with viewport coords from `range.getBoundingClientRect()`. Works across scroll containers without overflow-clipping.
- `AssistantText` markdown-lite renderer is exported from this file — single source of truth.

### `QuestionCard.tsx` refactor
- Removed: inline Deep Dive/chat/selection state and handlers, `chatPanelRef`, `chatScrollRef`, `chatInputRef`, the selection popup JSX, `useEffect` for auto-scroll. All now live in the tutor panel.
- Simplified the LOs row (no longer has the Deep Dive button inline) — button moved into the tutor panel itself.
- Added `<QuestionTutorPanel>` inside the explanation box in post-submit view.
- Net: 243 → 208 lines, behavior identical from the user's point of view.

### `AnalyticsDashboard.tsx` — Review tab now gets tutor features
- New `onDeepDive` and `onChatSend` props required (same signatures as `QuestionCard`).
- New internal `ReviewRowExpanded` component — owns its own `contentRef`, renders the existing vignette/lead-in/options/explanation layout PLUS a `<QuestionTutorPanel>` at the bottom.
- The old inline expansion JSX was swapped out for `<ReviewRowExpanded />`.

### `App.tsx` wiring
- `<AnalyticsDashboard>` now receives `onDeepDive={handleDeepDive}` and `onChatSend={handleChatSend}` — the same handlers already passed to `QuestionCard`. No new handlers needed.

### Invariant preserved
- Ephemeral chat still ephemeral — each `<QuestionTutorPanel>` instance owns its own chat thread in React state; no Supabase writes.
- Multiple rows can be expanded simultaneously; each has an independent chat. Re-collapse + re-expand resets that row's chat (acceptable trade-off for ephemeral v1).
- Past exams unaffected — same handlers, same backend endpoints, same `ExamQuestion` shape.

## 2026-04-20 — Per-question AI tutor chat + ask-about-selection

Extends Deep Dive from a single-shot evidence lookup into a multi-turn tutor conversation, scoped per-question. Also fixes the Deep Dive vagueness issues identified earlier by enriching the prompt with signals the app was already collecting but not using.

### New backend endpoint (`api/chat.ts`)
- Stateless — the client sends the full chat history each turn. Backend maps `'assistant'` to Gemini's `'model'` role and builds the `contents` array.
- System instruction is a concrete tutor persona: cite source by filename, quote verbatim when possible, mark reasoning-from-principle explicitly, address ruling-out logic when asked why wrong options are wrong, stay under ~600 words.
- **Enriched context** — the stable prefix baked into `systemInstruction` includes:
  - `metadata.sourceDocument` (from the 2026-04-16 analytics rewrite) flagged as `PRIMARY SOURCE` with other files as secondary. This was the missing signal that made Deep Dive feel vague.
  - The full question: vignette, lead-in, all 4 options, correct answer, authoritative `explanation`, and `losTested`. The old Deep Dive path only passed vignette + lead-in + correct-answer option.
- Model: `gemini-2.5-flash`, `temperature: 0.3`. No thinking budget override.
- Error handling mirrors `api/generate.ts`: 403/429/503 mapped to user-friendly messages.

### New TS type (`types.ts`)
- `ChatMessage = { role: 'user' | 'assistant'; text: string }`. Ephemeral — intentionally NOT added to `Project` or `ExamQuestion`.

### New service helper (`services/geminiService.ts`)
- `sendChatMessage(question, files, history, userMessage)` — POSTs to `/api/chat` and returns the reply string. Same error-forwarding pattern as `getQuestionSourceAnalysis`.

### Frontend integration (`App.tsx`, `components/QuestionCard.tsx`)
- `App.handleChatSend` aggregates `learningObjectivesFiles` + all section files (same shape as `handleDeepDive`) and logs a `question_chat` telemetry event.
- `QuestionCard` owns all chat UI and state: `chatMessages`, `chatInput`, `isSending`, plus refs for the input and auto-scroll.
- Deep Dive output (if present) is prepended to the history sent to the backend as an `assistant` turn, so follow-ups see the same evidence the student is looking at. It is NOT rendered twice — it stays in the blue "Source Analysis" block visually and lives in the outbound history invisibly.
- New `AssistantText` helper renders `**bold**` header lines + `- ` bullets without adding `react-markdown`. Used by both Deep Dive and chat assistant messages.

### "Ask about this" selection popup
- Scoped to `cardContentRef` (vignette, lead-in, options, explanation, Deep Dive). Selections inside the chat thread itself do NOT trigger the popup, so replies can be freely copied.
- Only active in review mode (`isSubmitted === true`).
- Click → prefills the chat input with *"What is the significance of '[selection]' in this question?"* and focuses the input. User can edit before sending.
- Positioned with `getBoundingClientRect()` offsets relative to the content container — no external positioning library.

### Design decisions
- **Ephemeral, not persistent** — chat state lives entirely in `QuestionCard` React state. Reload = fresh chat. Keeps the Supabase schema untouched and the blast radius small. If persistence is ever wanted, the comment in AGENTS.md points to the right place (`ExamQuestion.chatHistory?`).
- **Deep Dive kept as first-class** — rather than collapsing Deep Dive into the chat, the two cohabit. Deep Dive stays the fast "verify with source" button; chat is for follow-ups. Deep Dive output seeds the chat history automatically so follow-ups have context.
- **Prompt caching preserved** — the heavy stable prefix (files + question context) lives in `systemInstruction`; only the conversation turns go in `contents`. Follow-up turns after the first get Gemini's implicit prompt caching discount because the system instruction is byte-identical.
- **No new deps** — `AssistantText` is ~15 lines and handles the only markdown features we emit. No react-markdown.

## 2026-04-18 — Targeted practice modes + Question Review tab + maintenance cycling

Analytics already showed *what* the user was weak on, but the generator was unaware of it. Closed the loop end-to-end: the user can now generate exams that bias toward weak spots, with an Anki-style maintenance mechanism so previously-mastered LOs don't decay.

### New module: `services/practiceMode.ts`
Pure functions over `ExamAttempt[]` — no React, no side effects. Single source of truth for thresholds:
- `MIN_LO_SAMPLE = 3` — an LO needs ≥3 attempts before it can be called weak or mastered.
- `MASTERY_WINDOW = 3`, `MASTERY_THRESHOLD = 0.85` — mastery = ≥85% over last 3 attempts on that LO.
- `WEAK_THRESHOLD = 0.6` — overall accuracy at or below 60% with sufficient sample = weak.
- `MAINTENANCE_BASE_INTERVAL = 20`, `MAINTENANCE_INTERVAL_MAX = 200` — re-surface a mastered LO after 20 answered questions; doubles after each successful maintenance answer; capped at 200.
- `PRACTICE_MODE_UNLOCKS = { focused: 20, targeted: 50 }` — modes are gated by total questions answered in the project.

Exports: `computeUnlocks`, `isModeUnlocked`, `highestUnlockedMode`, `buildPracticeModeContext`, `buildPracticeDirective`.

### Schema additions (both optional for backward compat)
- `PracticeMode = 'balanced' | 'focused' | 'targeted'` in `types.ts`.
- `ActiveExamState.practiceMode?: PracticeMode` — persisted on the project so the user's choice sticks per-project.
- `QuestionMetadata.isMaintenance?: boolean` — set by Gemini when it generates a maintenance question; also added to the response schema in `api/generate.ts`.

### Generator wiring
- `generateExam` in `services/geminiService.ts` now takes `(practiceMode, history)` and appends a "PART 3: PRACTICE MODE DIRECTIVE" block to the prompt with the WEAK / STRONG / MAINTENANCE LO lists and up to 5 recently-missed stems for inspiration.
- The system instruction in `api/generate.ts` is extended to describe Practice Mode behavior — when PART 3 is absent, behavior is unchanged from before.
- `App.tsx` resolves the requested mode against current unlocks before calling `generateExam` (a stale `'targeted'` setting on a project that lost history falls back to the highest unlocked mode automatically).

### UI
- New Practice Mode pill selector under Difficulty (`App.tsx`). Three options:
  - **Balanced** (default) — current behavior, blueprint-driven, no history bias.
  - **Focused** (unlocks at 20 questions) — weak LOs get ~2× normal share, strong LOs ~0.5×, others unchanged.
  - **Targeted** (unlocks at 50 questions) — drops mastered LOs entirely, except for periodic Maintenance questions.
- Locked modes show a Lock icon + "Unlocks at N questions (M to go)" tooltip.
- Sub-label: "Recommendations sharpen as you complete more questions" — sets the expectation that the system improves with use.

### Maintenance question marking
- `QuestionCard.tsx` shows a small green "Maintenance" pill (with `RefreshCw` icon) next to the subtype tag when `metadata.isMaintenance === true`. Tooltip: "You aced this topic earlier — we're checking it's still solid." Hidden in print view.

### New "Review Questions" tab in AnalyticsDashboard
Past wrong/flagged questions were only recoverable via the JSON export. Added a fourth tab with:
- Filter pills: Needs review / Wrong only / Flagged only / All (each with a count badge).
- Free-text search across stems, LOs, clusters, and source filenames.
- Collapsible rows: show date / week / level / cluster / flag + maintenance badges in the collapsed view; full vignette + lead-in + all 4 options (color-coded with "Correct"/"Your answer" labels) + explanation + LOs + source doc when expanded.
- The tab label gets a red badge with the needs-review count.

### Why these defaults
- **20/50/100 unlocks (chose 20/50)**: per-week signal stabilizes by ~10 attempts/week (~20 total across a typical 4-section blueprint). Per-LO signal needs more — picked 50 as the lower bound where targeted recommendations stop being noise. 100 was reserved as a future tier if LO-level targeting needs more guardrails; 50 is the current ceiling.
- **Attempt-based maintenance, not time-based**: med students cram in bursts around exams, then go dormant between blocks. Time-based decay would mark everything "due" after a two-week gap and defeat the purpose. Attempt-based pacing aligns reintroduction with effort, not calendar.
- **Maintenance count is included in the requested total** (not added on top): user asks for 20 questions, they get 20. Maintenance just biases which LOs those questions cover — never overrides the size slider.

### Caveats
- Mastery/maintenance scoring depends on Gemini honoring the `losTested` array. If LO labels drift between exams (different casing, punctuation), they'll be treated as different LOs. The dashboard already trims; consider tightening if cardinality looks inflated.
- Recently-missed stems sent to the model are truncated to 600 chars each, max 5. Adjust caps in `practiceMode.ts` if prompt size becomes a problem.

## 2026-04-16 — Analytics rewrite: flag persistence, source-doc attribution, hierarchical study plan

Analytics previously tracked only right/wrong. Flags were local to the active exam and lost on submission, and there was no way to tell which uploaded file a missed question came from. Reworked the full data path end-to-end.

### Schema additions (both optional for backward compat)
- `QuestionMetadata.sourceDocument?: string` (`types.ts`) — verbatim filename of the lecture file that most directly inspired the question. Required in the Gemini `responseSchema` (server-enforced); optional in the TS type so exams generated before this change still load.
- `ExamAttempt.flaggedQuestions?: number[]` (`types.ts`) — question IDs the user flagged during the attempt. Copied from `activeExam.flaggedQuestions` into the `ExamAttempt` at submit time in `App.tsx`.

### Gemini prompt / schema (`api/generate.ts`)
- System instruction now describes the `--- FILE (Section Title): filename.pdf ---` prompt markers and tells the model to emit `metadata.sourceDocument` equal to the exact filename (including extension) that contributed the most specific detail. Falls back to the LO filename for pure-LO questions.
- `responseSchema.items.metadata` adds `sourceDocument: STRING` and marks all metadata fields `required`.

### AnalyticsDashboard rewrite (`components/AnalyticsDashboard.tsx`)
- Flattens `history` into a `QuestionEvent[]` (one per question attempt with `isCorrect` + `isFlagged`), then aggregates across week, cognitive level, cluster, LO, and source document.
- New metric shape: `{ correct, wrong, flagged, needsReview, total, accuracyPct, needsReviewPct }` where `needsReview = wrong OR flagged` (no double-count).
- Progress bars are now stacked (green correct / red-300 wrong) with an amber flag-count badge in the row label when any of the row's questions were flagged.
- Header stats: added a 4th "Flagged" card.
- New "AI Study Coach — Where to focus next" drilldown (replaces the flat Weaknesses list):
  1. Weakest **week** (by `needsReviewPct`, min-sample = 3).
  2. Within that week → weakest **learning objective**.
  3. Within that week+LO → most-implicated **source document**.
  4. Within that week+LO+source → top 2–3 **topic clusters** (as tags).
- New "Source Documents" tab alongside Topic & Level / Learning Objectives. Empty state explains the backward-compat situation for old exams.
- "Learning Objectives" table adds a "Flagged" column.

### Caveats
- `sourceDocument` attribution accuracy depends on Gemini — spot-check a few questions from a fresh exam. If attribution looks off, tighten the prompt (don't rip out the feature).
- Min-sample guards (`MIN_SAMPLE = 3` for weeks, `2` for LOs) prevent single-miss questions from dominating the drilldown.

## 2026-04-16 — `ThinkingLevel` enum: fix TS nominal-typing regression (`api/generate.ts`)

Antigravity-generated commit `478b046` migrated `thinkingBudget` → `thinkingLevel` but used raw string literals (`'HIGH' | 'MEDIUM' | 'LOW'`), which don't satisfy the nominal `ThinkingLevel` enum type from `@google/genai`. tsc flagged it with `2322`.

Fix: reference `ThinkingLevel.HIGH/MEDIUM/LOW` members directly. Runtime value is unchanged (enum members ARE those strings), but the type system only accepts them via the enum name.

General lesson for `@google/genai` usage: all SDK enums (`Type`, `ThinkingLevel`, `HarmCategory`, etc.) are nominal — never use equivalent string literals even if you can see the runtime value match.

## 2026-04-16 — Gemini 3 Pro thinking config: migrate to `thinkingLevel` (`api/generate.ts`)

Standard-difficulty exam generation was failing immediately with 400 from the Gemini API. Root cause: `gemini-3-pro-preview` rejects `thinkingBudget: 0` as an invalid configuration (Gemini 3 Pro is thinking-first — thinking cannot be disabled).

### What changed
- Replaced numeric `thinkingBudget` with the semantic `thinkingLevel` enum (`HIGH`/`MEDIUM`/`LOW`) on `gemini-3-pro-preview`.
- Difficulty mapping:
  - Expert → `ThinkingLevel.HIGH`
  - Hard → `ThinkingLevel.MEDIUM`
  - Standard → `ThinkingLevel.LOW`
- Imported `ThinkingLevel` from `@google/genai` (available in SDK ≥1.30).

### Why this over alternatives tried this session
- **`thinkingBudget: 0`** (original 2026-04-15 code) — rejected by Gemini 3 Pro with 400 INVALID_ARGUMENT. Broken.
- **Omit `thinkingConfig` entirely on Standard** (commit `6f8e52e`) — fixes the 400 but makes Gemini 3 Pro use its default (maximum) thinking budget, erasing Standard's 3× speed/cost win.
- **`thinkingBudget: 1024` on Standard** (commit `519c031`) — works and preserves speed, but Google's guidance for Gemini 3 is to use `thinkingLevel` (the old numeric budget is deprecated for the 3 series). `thinkingLevel` is forward-compatible and clearer intent.

### Reminder for future edits
- Do NOT set `thinkingBudget: 0` on Gemini 3 Pro.
- Do NOT omit `thinkingConfig` on Gemini 3 Pro — defaults to max.
- If switching models back to 2.5-series, `thinkingBudget` semantics are different (`0` disables, `-1` is dynamic). Don't blindly reuse this config shape across model generations.

## 2026-04-16 — Post-migration hotfixes (autosave 400s, generate 504s, Expert UI)

Three bugs surfaced during live testing of the new Vercel + Supabase stack. All fixed in-session.

### 1. XLSX autosave → Postgres 22P05 (`services/fileService.ts`, `services/storageService.ts`)
- Autosaves were failing with `400 Bad Request` and Postgres error `22P05: \u0000 cannot be converted to text`.
- Root cause: `XLSX.utils.sheet_to_txt()` returns **UTF-16 LE with a BOM**, which means every character is interleaved with NUL bytes. Postgres JSONB rejects `\u0000`.
- Fix: switched to `XLSX.utils.sheet_to_csv()` (UTF-8) in `readXlsx`.
- Defensive safety net: added `stripNulls()` helper in `storageService.saveProject` that scrubs `\u0000` from any project before upsert. Prevents future parser regressions from bricking autosave.

### 2. `/api/generate` → 504 FUNCTION_INVOCATION_TIMEOUT (`vercel.json`)
- Hard + 20 questions measured at **75.5s**, exceeding the default Vercel Hobby 60s `maxDuration`.
- Fix: enabled **Fluid Compute** via `"fluid": true` in `vercel.json` and bumped `maxDuration: 60 → 300` for both `api/generate.ts` and `api/analyze.ts`.
- Verified against Vercel's official docs: Hobby + Fluid Compute = 300s default / 300s max (shipped April 23, 2025). Not an AI hallucination — Vercel CTO Malte Ubl confirmed on X.
- Headroom: Hard+40 projects to ~150s, Expert+20 to ~150s. **Expert+40 (~300s+) is still over the cap** — hence the UI change below.

### 3. Expert difficulty hidden from generator UI (`App.tsx`)
- Expert+40 would break the 300s ceiling. Rather than ship a partial solution, hid the Expert button until a batching strategy lands.
- Grid is now 2 columns (Standard / Hard). If a project was previously saved with `difficulty === 'expert'`, the Hard button highlights so the selector isn't blank.
- The `'expert'` value is still valid in `DifficultyLevel` and still renders the red "Expert" badge on completed exams in history.
- Dropped unused `SignalHigh` import.

### Ideas not implemented (yet)
- **Frontend batching** for very large exams (>25 questions or Expert+anything): generate in chunks of 5-10, de-dup by feeding prior batch IDs back into each prompt. Required to re-enable Expert+40.
- **Streaming (`generateContentStream`)**: not useful on its own — the client needs complete JSON to parse, and Fluid Compute + 300s already solves the reliability issue for all non-Expert+40 combos.

## 2026-04-16 — Migration to Vercel Serverless & Supabase Architecture

Migrated from a client-side only prototype (`IndexedDB` + exposed API key) to a production-ready application using Vercel Serverless and Supabase PostgreSQL.

### 1. API Security & Serverless Backend
- Created Vercel serverless functions (`api/generate.ts`, `api/analyze.ts`, `api/ocr.ts`).
- The `@google/genai` SDK was moved entirely to the backend endpoints to securely hide the `GEMINI_API_KEY` from the browser bundle.
- Rewrote `services/geminiService.ts` to execute standard POST fetches to the `/api/*` routes instead of directly calling the AI SDK.

### 2. Database Persistence & Auth (Supabase)
- Scrapped mock local `IndexedDB` caching and user accounts.
- Integrated `@supabase/supabase-js`.
- Configured real Email/Password authentication using Supabase Auth in `App.tsx`.
- Rewrote `services/storageService.ts` to sync the `Project` interface directly to a Supabase Postgres table with RLS (Row Level Security) enforcing one-account-per-user access.

## 2026-04-15 — Exam instruction overhaul (CNC ME alignment)

Cross-referenced CNC ME prep video and 4 WFQ answer keys (Pain, Surgery, MPA, Cancer) against the existing prompt instructions. Changes are additive — nothing removed, kept generalizable across any Temerty block.

### 1. System instruction rewrite (`constants.ts`)
- **Vignette elements expanded:** Added Medications and Investigations (labs/imaging/tables) to the checklist. CNC questions heavily test drug interactions and lab interpretation — old prompt omitted both.
- **Vignette length range widened:** Was "3-6 sentences" for everything. Now: 4-8 for clinical scenarios, 1-3 for concept/definition questions. Matches actual WFQ question variety.
- **Red herring rule tightened:** Old rule said "No red herrings unless to rule out distractors" (ambiguous). CNC video explicitly says "No details should be irrelevant." New rule: every detail must help arrive at the answer or rule out a distractor.
- **Distractor homogeneity now default:** Was only enforced in Hard difficulty. Moved to base system instruction — every CNC WFQ uses homogeneous distractors at all difficulty levels.
- **Added "Best Next Step" decision framework:** New Rule #6. Two-step reasoning (identify → decide), stable/unstable branching, "do nothing" as valid answer. This is the dominant CNC question type per the ME prep video.
- **Added contextual accuracy rule:** New Rule #7. Permits jurisdiction-specific content (OHIP, screening programs, etc.) when present in source material, but forbids fabrication.
- **Source material language generalized:** "Lecture material" → "lectures, self-learning modules, case-based learning sessions, pre-readings, and reference handouts."

### 2. Hard difficulty de-bugged (`services/geminiService.ts`)
- Removed "Include minor red herrings" — **directly contradicted Temerty guidance.** Replaced with "Include details that could plausibly point to a close competing diagnosis, requiring careful rule-out." Added "medications, lab values, or comorbidities that add realistic complexity."

### 3. Question subtypes expanded (`types.ts`)
Added 6 new subtypes observed across CNC WFQs. All existing subtypes kept (Localization and DomainMatching still useful for neuro/other blocks):
- `IndicativeSignOrSymptom` — "most specific sign/symptom" questions
- `SideEffectOrAdverseEffect` — drug adverse effect questions (dominant in pharm-heavy weeks)
- `DrugInteraction` — drug-drug interaction reasoning (ferrous/cipro, ACE-I/lithium pattern)
- `EthicsOrConsent` — capacity, beneficence, consent process
- `PreventionFramework` — primary/secondary/tertiary prevention classification
- `SocialDeterminantsOrSystemNavigation` — SDOH, insurance programs, system access barriers

## 2026-04-15 — Gemini API optimizations

All changes in `services/geminiService.ts`.

### 1. Fixed invalid model alias
- `gemini-2.5-flash-latest` → `gemini-2.5-flash` in all 3 call sites (`extractTextFromImage`, `transcribeMedia`, `getQuestionSourceAnalysis`).
- `-latest` is a legacy v1beta REST convention and is not a valid model ID in the `@google/genai` SDK. The old string may have been silently failing or falling back.

### 2. Gated `thinkingBudget` by difficulty in `generateExam`
- Was: `thinkingBudget: 4096` on every call.
- Now: `4096` for Expert, `2048` for Hard, `0` for Standard.
- Rationale: Standard-difficulty questions are straightforward recall/application and don't benefit from deep chain-of-thought. This makes Standard exams ~3× faster and meaningfully cheaper with no quality regression. Hard/Expert keep full reasoning.
- **Superseded 2026-04-16** (see entry below): Gemini 3 Pro rejects `thinkingBudget: 0`. Migrated to `thinkingLevel` enum.

### 3. Reordered Deep Dive prompt for implicit caching
- `getQuestionSourceAnalysis` now puts `SOURCE FILES` FIRST in the prompt, with the question-specific part at the end.
- Task framing moved out of the user turn and into `config.systemInstruction`.
- Rationale: Gemini implicit prompt caching requires a stable prefix. With files first, clicking Deep Dive on multiple questions from the same uploaded source gets ~75% off input tokens on subsequent calls. Previously the question was near the top of the prompt, which defeated caching.

### Model roles (unchanged, documented for clarity)
- **`gemini-3-pro-preview`** writes the actual exam questions in `generateExam`. Quality-critical path.
- **`gemini-2.5-flash`** handles OCR, audio/video transcription, and Deep Dive source verification. Retrieval/extraction only; never writes questions.

### Ideas not implemented
- Streaming responses (`generateContentStream`) so questions appear incrementally instead of waiting for the full JSON.
- Dual-vendor fallback to Claude Sonnet 4.6 on 503s from Gemini 3 Pro.
- Client-side hashing of blueprint file content to avoid re-uploading unchanged sources on regenerate.
