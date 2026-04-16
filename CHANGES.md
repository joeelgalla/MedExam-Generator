# Changes

Running log of non-trivial changes to MedExam-Generator. Newest first.

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
