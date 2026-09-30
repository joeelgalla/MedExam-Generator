# Changelog

## 2026-09-29 - Laboratory context and clinical question-writing checks

Updated shared built-in and external-packet instructions to require sourced laboratory reference intervals, distinguish those from clinical thresholds, include numerical interpretation, and review distractor plausibility and explanation consistency. Clarified that a stable patient does not automatically need another test when treatment is already indicated. Clinical banks and source material remain outside this public repository.

Validation: 54 automated tests, typecheck, production build and diff checks pass. These are software checks, not clinical calibration. Private item revisions have a separate clinical audit and preserve attempt snapshots.

## 2026-09-27 - Feedback typing and safe exam revisions

Fixed the feedback dialog losing focus after each typed character by giving it a stable component identity. Drafts survive closing/reopening; Copy feedback works without an email application, and Open email draft no longer points at a placeholder recipient or clears the text before delivery.

Added optional contentRevision to saved banks/imports/shares. Higher revisions win against stale device banks, while equal-version conflicts still stop and existing active/completed snapshots remain untouched. Shared writing rules reject gratuitous absolute qualifiers and answer-length cues. Private exam content remains outside this repository.

Validation: 54 tests, typecheck and production build pass. Chrome continuous typing, newline entry, copy status and close/reopen passed. Private content validation confirms four 20-item sets, all 80 stable IDs retained, 14–15 buckets per set (maximum two per bucket), and linked cases kept together. Cloud data update follows deployment; read the private receipt for its final result.

## 2026-09-27 - Explain zero model quota accurately

A production generation attempt returned zero free-tier Pro quota. The app now directs the owner to Gemini API billing instead of presenting that condition as a temporary rate limit. Existing saved exams remain available.

Validation: 51 tests, typecheck, build and diff checks pass. A stubbed upstream 429 verifies the installed SDK makes exactly one request on each of the four paid routes; ordinary throttling remains distinct from zero model quota. No provider retry or model downgrade.

## 2026-09-27 - Enforce generated objective tags and tolerate malformed citation hints

Registry-backed generation now requires objectiveIds, topicId and bucketId in Gemini's response schema. Optional malformed generated citations are discarded without relaxing question, answer-key, objective or imported-file validation. Generated question numbers and app-owned item IDs are normalized; linked-case labels map without collisions. Server logs record token counts and model only.

Validation: 50 tests, TypeScript, production build and diff checks passed. Regression checks cover registry versus legacy schema requirements, token-only logging, malformed citations, and retained strict answer/objective validation. Live generation is checked after deployment and recorded in the private delivery receipt.

## 2026-09-27 - Save device projects to an account

Added a sign-in continuation and Save to account action, plus confirmed cloud import for device-marked shared projects/backups. The copy retains full study state, uses a stable owner-scoped ID for retries and redirects only after cloud saving succeeds. The original stays available as recovery. Gemini opt-in remains independent of storage mode.

Validation: 48 tests, typecheck and build passed. Browser verified the account-save explanation and sign-in continuation with the source project ID. Actual signed-in transfer awaits the owner session.


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
