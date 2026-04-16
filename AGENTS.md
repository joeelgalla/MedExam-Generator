# AGENTS.md

Guidance for AI coding agents working in this repo — **Antigravity agents and Claude Code**. If you're a human, `README.md` is a better starting point.

## What this app is
MedExam Generator — a Vite + React 19 + TypeScript single-page app that turns uploaded medical lecture material and learning objectives into a structured practice exam. All AI calls go through `@google/genai` (Gemini).

## Stack
- Vite 6, React 19, TypeScript 5.8
- **Backend:** Vercel Serverless Functions (`/api/*`). The `@google/genai` SDK is executed here to keep the API key completely hidden from the browser.
  - **Fluid Compute is required** (`"fluid": true` in `vercel.json`). Without it, Hobby caps at 60s; Gemini 3 Pro with thinking exceeds that. With it, Hobby gets 300s. Don't remove.
  - `maxDuration: 300` on both `api/generate.ts` and `api/analyze.ts`.
- **Database & Auth:** Supabase (PostgreSQL with RLS + Email/Password Auth).
- Tailwind via CDN in `index.html` (no PostCSS pipeline)
- `react-to-print` for exam export
- State is plain React (no Redux/Zustand)

## Structure
- `App.tsx` — top-level shell, routing between setup / generation / review views, and Supabase auth flow.
- `api/` — Vercel serverless functions (`generate.ts`, `analyze.ts`, `ocr.ts`). All direct AI SDK interactions live here.
- `components/` — UI components
- `services/geminiService.ts` — Maps frontend actions to Fetch calls hitting the `/api/*` Vercel endpoints.
- `services/storageService.ts` — Handles all Supabase CRUD operations for projects.
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
- **Error handling in Vercel endpoints** already maps 403/429/503 to user-friendly messages. `geminiService.ts` forwards these to the UI.
- **API Security:** Do NOT leak `process.env.GEMINI_API_KEY` to the Vue/React bundle. It must only be accessed inside `api/*.ts`.
- **Telemetry:** `TELEMETRY_ENDPOINT` in `constants.ts` is a live Google Apps Script endpoint. Don't rotate without coordinating.
- **XLSX parsing:** use `XLSX.utils.sheet_to_csv` (UTF-8), **not** `sheet_to_txt` (UTF-16 LE with NUL bytes — Postgres JSONB rejects them with error `22P05`).
- **Saving to Supabase:** all project data goes through `stripNulls()` in `storageService.saveProject` as a safety net. Don't bypass it. If a new parser or import path is added that produces raw bytes, the helper keeps autosave from breaking.
- **Expert difficulty is hidden from the generator UI** (2026-04-16) until frontend batching exists. `'expert'` is still a valid `DifficultyLevel` — completed exams still render the Expert badge. Don't remove the enum value. To re-enable, restore the button in `App.tsx` + flip the grid to `grid-cols-3`.

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
