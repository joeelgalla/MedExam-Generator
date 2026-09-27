# Changelog

Existing application history is in [CHANGES.md](CHANGES.md).

## 2026-09-26

- Added an isolated private-practice entry with validated local exam imports, registry-linked optional question IDs, resumable countdown, answer and flag persistence, history, review filters, per-attempt bucket counts and additive backup restore.
- Added visible save failures, revision conflict protection and a single-writer browser lock. The original Supabase workflow remains unchanged.
- Bundled private-page CSS and a restrictive production content policy; no external scripts, telemetry, AI calls or course data in this page's source. Paid AI handlers return 503 on Vercel preview deployments.
- Made the question-writing model configurable through `GEMINI_QUESTION_MODEL`, defaulting to `gemini-3.1-pro-preview`. This has not been tested with a paid model call and is not a proven fix for the production generation error.
- Added 22 focused tests for imports (including 60-question mocks), persistence, timer, legacy rendering and all preview API guards; test/typecheck/build pass.
