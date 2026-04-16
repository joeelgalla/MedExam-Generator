# AGENTS.md

Guidance for AI coding agents working in this repo — **Antigravity agents and Claude Code**. If you're a human, `README.md` is a better starting point.

## What this app is
MedExam Generator — a Vite + React 19 + TypeScript single-page app that turns uploaded medical lecture material and learning objectives into a structured practice exam. All AI calls go through `@google/genai` (Gemini).

## Stack
- Vite 6, React 19, TypeScript 5.8
- `@google/genai` SDK, no backend — API key is read from `process.env.API_KEY` (Vite env) client-side
- Tailwind via CDN in `index.html` (no PostCSS pipeline)
- `react-to-print` for exam export
- State is plain React (no Redux/Zustand)

## Structure
- `App.tsx` — top-level shell, routing between setup / generation / review views
- `components/` — UI components
- `services/geminiService.ts` — **all Gemini API calls live here.** Any model/prompt change goes here.
- `constants.ts` — `SYSTEM_INSTRUCTION_BASE` (exam blueprint + rules) and telemetry endpoint
- `types.ts` — `UploadedFile`, `ExamQuestion`, `BlueprintSection`, `DifficultyLevel`, `QuestionSubtype`

## Exam instructions are Temerty-tuned (but generalizable)
`SYSTEM_INSTRUCTION_BASE` in `constants.ts` and the difficulty blocks in `geminiService.ts` have been tuned against Temerty Faculty of Medicine exam guidance (CNC ME prep video + multiple WFQ answer keys). Key guarantees:
- **No red herrings** — every detail in a vignette must help arrive at the answer or rule out a distractor. Do not reintroduce "add red herrings" in any difficulty block.
- **Distractor homogeneity is baseline**, not a Hard-only perk. Keep it in the base system instruction.
- **"Best Next Step" reasoning** is codified as a rule (stable → more data; unstable → intervene; "do nothing" is valid). Preserve this when editing.
- **Jurisdiction-specific content** (OHIP, screening programs, etc.) is permitted only when present in source material. No fabrication.
- Rules are written generically — they apply to any Temerty block, not just a specific one. When tuning for a specific block, prefer adding to the rules over replacing them.

## Model roles (do not break this split)
- **`gemini-3-pro-preview`** — writes exam questions (`generateExam`). Quality-critical. Uses strict `responseSchema` + `thinkingConfig`.
- **`gemini-2.5-flash`** — OCR (`extractTextFromImage`), media transcription (`transcribeMedia`), and Deep Dive source verification (`getQuestionSourceAnalysis`). Retrieval/extraction only — never swap Flash in for question generation.

## Recent changes & rationale
See [CHANGES.md](./CHANGES.md) for the running log. Read it before modifying `services/geminiService.ts` — recent optimizations (model IDs, `thinkingBudget` gating, prompt ordering for implicit caching) have specific reasons that aren't obvious from the code alone.

## Conventions for agents
- **Prompt edits:** keep stable prefixes (source files, system instructions) at the *top* of the prompt to preserve Gemini implicit prompt caching. Put volatile per-request data (the specific question, user inputs) at the end.
- **Schema changes:** if you add fields to `ExamQuestion`, update both `types.ts` and the `responseSchema` in `generateExam`. The schema is enforced server-side — drift breaks parsing.
- **Subtype enum:** `QuestionSubtype` in `types.ts` is intentionally broad to cover the range of Temerty question styles (diagnosis, best next step, side effects, drug interactions, ethics, prevention frameworks, SDOH, etc.). `QuestionCard.tsx` renders the raw enum value via `.replace(/_/g, ' ')`, so new values display automatically — no UI wiring needed when adding a subtype. The Gemini schema field is unconstrained (`Type.STRING`) so the model picks from whatever the system instruction describes.
- **Thinking budget:** keep it gated by difficulty in `generateExam`. Don't blanket-enable thinking for Standard exams.
- **Error handling in `geminiService.ts`** already maps 403/429/503 to user-friendly messages — extend that pattern, don't add silent try/catches.
- **No backend:** this is a pure client app. Do not introduce a Node server without asking. API keys are injected at build time via Vite env.
- **Telemetry:** `TELEMETRY_ENDPOINT` in `constants.ts` is a live Google Apps Script endpoint. Don't rotate without coordinating.

## Running
```
npm install
npm run dev       # vite dev server
npm run build     # production bundle
```

Requires `API_KEY` in `.env.local` (Gemini API key).

## When in doubt
- Read `CHANGES.md` first — recent decisions are there.
- Preserve the Flash/Pro split.
- Don't add dependencies for things a small helper can do.
