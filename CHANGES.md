# Changes

Running log of non-trivial changes to MedExam-Generator. Newest first.

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
- Now: `4096` for Expert, `2048` for Hard, `1024` (minimum allowable) for Standard.
- Rationale: Standard-difficulty questions are straightforward recall/application and don't benefit from deep chain-of-thought. Gemini 3 Pro rejects `0` and if omitted, defaults to maximum, so `1024` restricts it to the lowest possible threshold to make Standard exams ~3× faster and meaningfully cheaper with no quality regression. Hard/Expert keep full reasoning.

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
