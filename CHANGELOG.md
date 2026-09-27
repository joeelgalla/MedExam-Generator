# Changelog

## 2026-09-27 - Reusable project exams and shared question-writing recipe

Projects now hold optional structured objectives, original worked examples, question-writing instructions and saved exam banks. Import/file paste, built-in generation and the external-AI packet feed the same timed attempts, review and answered-only progress. Shared projects exclude personal state; private backups and standalone-history restore retain it. Legacy projects remain supported.

Added device storage, visible save failure/recovery, single-tab editing, cross-device history/answer merging and conditional cloud writes using the existing timestamp column. An isolated conflict creates a local recovery project without hiding other account projects. All paid routes now verify Supabase identity and the owner allowlist. Sources are selected by topic/section without silent truncation; built-in requests cap at 20 questions and never auto-retry.

Validation: 46 automated checks, TypeScript and production build; browser import/start/answer/flag/reload/submit, clean export/fresh-origin import and 390px layout. A synthetic transaction on hosted Supabase verified authenticated-role RLS plus microsecond timestamp equality and rejected a stale conditional write; it was rolled back. This does not substitute for an interactive signed-in browser sync test. Live billable Gemini generation remains approval-dependent and unverified. No private course material or persistent database changes are part of this code release. The same 16 pre-existing production dependency advisories remain (1 low, 3 moderate, 10 high, 2 critical).

## 2026-09-27 - Replace retired question-generation model

Vercel runtime error clusters confirmed an upstream 404 for `gemini-3-pro-preview`, explicitly naming `gemini-3.1-pro-preview` as its replacement. The default now uses that replacement; a trimmed `GEMINI_QUESTION_MODEL` override remains available. Flash extraction/tutor routes are unchanged.

Validation: 24 tests pass, including the actual production handler with a stubbed SDK HTTP transport (default/override model, Standard/Hard thinking levels and response parsing). TypeScript and production build pass. No paid generation request was made; a billable end-to-end generation remains unverified. Importable private exams do not call Gemini.

## 2026-09-26 — Import and share exams

- Added entry links on sign-in and project list, an exam-only share download, and copyable instructions for a friend. Shared exams exclude personal answers, flags, timers and history.
- Verified 23 tests, typecheck/build, actual browser download/copy and import into fresh learner storage.
- Retained the original production generation-model default; generation repair remains separate.

Existing application history is in [CHANGES.md](CHANGES.md).

## 2026-09-26

- Added an isolated private-practice entry with validated local exam imports, registry-linked optional question IDs, resumable countdown, answer and flag persistence, history, review filters, per-attempt bucket counts and additive backup restore.
- Added visible save failures, revision conflict protection and a single-writer browser lock. The original Supabase workflow remains unchanged.
- Bundled private-page CSS and a restrictive production content policy; no external scripts, telemetry, AI calls or course data in this page's source. Paid AI handlers return 503 on Vercel preview deployments.
- Made the question-writing model configurable through `GEMINI_QUESTION_MODEL`, defaulting to `gemini-3.1-pro-preview`. This has not been tested with a paid model call and is not a proven fix for the production generation error.
- Added 22 focused tests for imports (including 60-question mocks), persistence, timer, legacy rendering and all preview API guards; test/typecheck/build pass.
