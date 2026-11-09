# Changelog

## 2026-11-09 - Quieter exam-screen annotation controls

Smaller Highlight/Strike out/Erase buttons, the how-to line only while a tool is on, Clear marks only when something is marked, and borderless cross-out buttons beside each answer. Same functions. Deployed as b31a91e.

## 2026-11-09 - Report button during exams

A quiet "Report" button beside Flag lets a signed-in learner mark a question for review with an optional comment while the exam is running; it does not change the answer or score. Deployed as 15ca978.

## 2026-11-09 - Report a problem with a question

After submitting, and in Progress review rows, "Report a problem" lets a signed-in learner mark a question for review with an optional comment; the button then reads "Marked for review" and can be edited or removed. Reports go to a new `question_reports` table with row-level security (own rows only, no anonymous access), outside the synced project document, and keep the chosen answer, key and a short snapshot. Not shown during a running exam or on the standalone practice page. 110 tests (2 new), typecheck and build pass; deployed as 09b4b57.

## 2026-11-09 - Favicon

Added a blue "M" favicon (SVG, 32 px PNG and Apple touch icon) to the app and the standalone practice page so the tab is recognizable; it replaces the missing-favicon 404. No script changes. Deployed as 7e44531 (GitHub deployment 7662875728; all three files return 200 with the right content type).

## 2026-11-09 - Current exam names on headers and resume buttons

A renamed saved exam now shows its current name on the results header, the in-progress banner and the Resume buttons for unfinished attempts, instead of the name copied when the attempt started. Progress tab output is unchanged (compared against 3c0b963 with real attempts). 108 tests, typecheck and build pass.

## 2026-11-09 - Exam list shows which sets are done

Finished attempts never recorded which saved exam they came from, so the exam list guessed status from question overlap; once later sets reused bank questions, every card read "Retake exam". Each finished attempt is now linked to the saved exam it matches by question IDs. Finished sets show "Done" with the latest score and a quieter Retake button, sets not taken keep the blue Start button, the heading shows "N of M done", and Previous attempts name the set. Presentational only: no data, scoring or AI changes. 108 tests (4 new), typecheck and build pass; deployed as 165a1f5.

## 2026-11-09 - Compact answer review

After submitting, each question shows the explanation first. Sources, objectives and the author's note fold into one closed "Sources & objectives (N)" disclosure, listing each source once. The tutor chat opens from an "Ask the AI Tutor" button and keeps its conversation when closed; "Ask about this" on selected text still opens it. Progress review rows get the same treatment, and the header no longer repeats the cluster when a question has no week. Presentational only: no data, scoring or AI changes. 104 tests, typecheck and build pass; deployed as 1c2ec37 (GitHub deployment 7660664613, live chunk checked).

## 2026-11-08 - Upgraded default question generation model to Gemini 3.8 Flash and handled 504 timeouts

Switched `DEFAULT_QUESTION_MODEL` in `lib/server/geminiClient.ts` from `gemini-3.1-pro-preview` to `gemini-3.8-flash`, increased the writer pass timeout in `api/generate.ts` to 210s, and mapped upstream `504 DEADLINE_EXCEEDED` responses to an explicit timeout message in `lib/server/generationError.ts`. Benchmarking on the full 20-question Psychiatry prompt (`142,658` input tokens, `14,062` output tokens) reduced writer + blind-checker execution from >170s (`504 DEADLINE_EXCEEDED`) to 147.1s end-to-end. All 103 tests, TypeScript, and production build pass.

## 2026-11-08 - Restored exam task tags and enforced harder generation

Cognitive-level names (Recall, Understanding, Application) and question subtypes are visible during active cloud and standalone exams again. Topic/objective hints remain post-submit. The generation checker now classifies cognitive level and subtype independently and replaces writer labels; hard/expert generation rejects items assessed as foundational. Writer instructions explicitly reject tone-based elimination and require answer-determining case details. No fixed cognitive quotas or claim of validated ME difficulty.

103 tests, TypeScript and production build pass. The separate annotation/all-account-AI change is deployed as PR19 / 6beed57 and eleven production Chrome checks pass. Only the existing favicon 404 occurred. Private Psychiatry-bank difficulty/metadata revision is separate from this public code change.


## 2026-11-08 - Reversible annotations and AI access for all accounts

Joe requested highlight-before-select, unhighlighting and strikethrough, then explicitly requested Gemini access for everybody. Replaced vignette DOM wrapping with plain-text offset annotations: persistent tool selection, selection-first toggles, partial erasing, overlapping highlights/strikes, lead-in/option support, and independent choice elimination. Answer selection is suppressed during drag selection; keyboard answer selection remains available. Annotation state remains local to the mounted question, like the previous highlighter.

Removed the owner AI allowlist from the shared authorization check. Every remotely verified, signed-in non-anonymous account can use generation, tutor, source analysis and OCR; preview disabling and token validation remain. No database or provider changes. Regression tests cover the updated access policy, invalid/anonymous token denial, and annotation overlap/removal. 102 tests, typecheck and build pass. Isolated Chrome exercised eleven interaction/layout checks at desktop and 390px; only the existing missing favicon warning occurred. Deployment/readback pending. Private QA artifacts are outside this public repo.


## 2026-11-08 - Added Vertex AI authentication and upgraded Flash routes to Gemini 3.8 Flash

Added `lib/server/geminiClient.ts` so `/api/generate`, `/api/analyze`, `/api/chat`, `/api/ocr`, and `/api/ai-status` authenticate against Google Cloud Vertex AI when `GOOGLE_VERTEX_CREDENTIALS_JSON` is configured, avoiding the depleted AI Studio prepay wallet while retaining `GEMINI_API_KEY` fallback. Upgraded `/api/analyze`, `/api/chat`, and `/api/ocr` from deprecated `gemini-2.5-flash` to `gemini-3.8-flash` (`GEMINI_FLASH_MODEL`) and kept `gemini-3.1-pro-preview` (`GEMINI_QUESTION_MODEL`) for `/api/generate` and blind answer verification. Added unit and source-analysis regression tests; 99 tests, TypeScript, and production build pass.

## 2026-11-08 - Clarified coverage and completed review search

Expanded completed-review search to objective IDs, options and explanations; added project-scope wording to coverage and explicit supplemental/primary-objective labels to question reviews. Fixed the empty-objective JSX guard. Learner data and scoring logic unchanged.

## 2026-11-08 - Limited progress claims to observed samples

Reworded flag and cognitive-level guidance around the measured sample rather than broad ability claims. Wrapped workspace navigation and arranged analytics tabs in two columns on narrow layouts to prevent observed horizontal overflow. 98 tests, typecheck and build pass; no learner-state or scoring changes.

## 2026-11-08 - Preserved secondary chapter evidence in AI context

Include complete secondary cited teaching chapters in tutor and planned-generation contexts, retaining historical-recall and supplement boundaries. Label the tutor input/send controls for accessibility. 98 tests, typecheck and production build pass.

## 2026-11-08 - Distinguished depleted credits from request limits

A live provider HTTP 402 was mislabeled as a transient rate limit. All AI routes now explain depleted prepaid credits and retain saved exams/reviews. Added billing classification and no-retry SDK-route regression coverage; 97 tests, typecheck and build pass.

## 2026-11-08 - Fixed compiled generation imports and hosting-error feedback

Enabled relative TypeScript import-extension rewriting during server emission. The generation verifier and its dependencies now resolve emitted JavaScript instead of missing source files. Non-JSON AI endpoint failures report the HTTP status and preserve existing exams instead of displaying a JSON parser exception. Added real emitted-handler loading and response-error regression coverage; all 96 tests, TypeScript and production build pass. No database, model, billing or learner-state changes.

## 2026-10-01 - Practice timer no longer submits automatically

Removed expiry-triggered submission from the project player, answer/flag handlers, restored attempts, and standalone player. A visible pacing timer reaches zero without revealing answers; only an explicit Finish action submits. Submission timestamps reflect actual completion, including overtime. Withdrawn accidental-attempt IDs survive device merges and private backup restoration so a stale device cannot restore a cancelled result or close its recovered replacement. Friend shares omit recovery metadata.

Validation: 92 automated tests, TypeScript and production build pass. Isolated Chrome UI check crosses the deadline, answers afterwards, preserves flags, reloads without exposing keys, and submits explicitly with blanks scored wrong; desktop and 390px checks have no page errors or private network writes. Standalone Chrome also verifies expiry, later answers, reload and explicit submission. Its development-only StrictMode lock acquisition race was reproduced and fixed by skipping cancelled effect requests. Owner-specific recovery evidence is in Clerkship, not the public repo.


## 2026-10-01 - Actual exam calibration and course-supported practice

Added project exam-reference files shared by built-in generation and external instructions. Actual examples guide task demands and the source-blind answer checker, remain separate from teaching evidence and the tutor, and survive project sharing/backups. Course-first generation excludes explicitly marked supplemental notes. Written knowledge associated with every objective is eligible; sourceTopicIds retrieve clinical teaching across bucket boundaries. Removed arbitrary cognitive-level quotas and require plausible parallel distractors. Per-item invalid-source isolation, reference passage-copy checks and legacy FILE-marker compatibility prevent avoidable whole-set failures.

Added versioned withdrawal of weak banks: withdrawn items are absent from new practice, coverage and friend shares while old attempt snapshots/backups survive. Three-way configuration merging prevents an old tab's answer save from undoing repaired instructions or source mappings. Shared-project controls disclose inclusion of exam examples.

Validation: 90 automated tests, TypeScript and production build passed. Real Chrome synthetic tests verified reference-file import, written-skill coverage, desktop/390px layout and no page errors. Existing Fable partner identified source mapping, quote leakage, batch scope and persistence issues; implemented corrections have targeted regression tests. Private clinical-bank review and production deployment receipts are recorded in Clerkship, not this public repository. No schema changes or embedded course data.


## 2026-10-01 - Objective planning and checked generation

Blanks in submitted exams now count as misses throughout targeting and review. Added primary-objective coverage including absent questions and performance skills, one-click gaps/misses practice, distinct-item strength thresholds, and stable recheck chains that target a missed rule without clearing it on a different fact. Structured plans rotate across at most six complete source topics; legacy free-text projects retain generation/import and feedback.

Generation now includes a separate source-based Pro solve without the writer key or rationale. Choices and feedback bind by exact text before code balances answer letters. Clinical criteria/source passages, objective fit and planned rechecks are checked; per-item exclusions retain accepted questions and leave gaps visible. Exact quotations use normal/recovered PDF page markers, filenames are enum constrained, and unsupported/incomplete output is not saved. Writer and checking calls have explicit deadlines within Fluid 300s; no automatic paid retry. Private curriculum and clinical banks remain outside git.

Validation: 83 automated tests passed, TypeScript and production build passed, and Chrome synthetic blank/coverage/targeting workflow passed at desktop and 390px. The existing Fable partner closed five release blockers; the subsequent fixes require criteria checks, label supplement evidence, and handle thinking-only output exhaustion. Provider control checks accepted a supported task and rejected failed drafts, but rejection was partly quotation/polished-feedback gating, not proof of independent medical correctness. The live handler attempt used a disposable auth stub and an artificially lowered test output cap; it truncated before checking. No successful authenticated production 20-item write/check/save is claimed. Deployment and private project revision receipts belong to the Clerkship workspace.


## 2026-09-29 - Live usability verification follow-up

Production account check confirmed the same workspace for current and older projects, with existing progress retained. Removed the empty-library onboarding panel while a legacy attempt is in progress and suppressed a duplicate quota error message. Live synthetic generation reached Google and returned HTTP 429 with zero free-tier Pro quota; no successful generation is claimed. Saved exam/import/share workflows remain usable.

## 2026-09-29 - Consistent project workspace and recoverable tab handoff

All projects now use the same Exams / Progress / Materials navigation. Generation is a primary action with a dedicated settings screen; importing is an optional adjacent action. Added newcomer instructions, a single sharing dialog with recipient steps, visible legacy histories/unfinished attempts, modal keyboard handling, and consistent controls. Project URLs survive reloads. No course data, bank revisions, cloud rows, schema or AI access list were changed.

Replaced one-shot tab exclusion with queued Web Locks and cooperative save-before-handoff; the original tab requeues, failed saves retain ownership, and expired attempts complete after takeover. The availability endpoint checks auth/configuration without using Gemini. Actual quota errors are distinguished and remembered for the session, with an explicit recheck. No model downgrade, plan change or automatic paid retry.

Validation: 68 automated tests passed; TypeScript and production build passed. Real Chrome synthetic checks covered new/legacy/shared projects, import/start/answer/flag/reload/review, fresh-recipient sharing, two-tab handoff/close recovery, expiry, and 390px no-overflow layout. Existing Fable partner and Kimi reviewed public code; accepted findings were fixed. This does not certify clinical accuracy or a successful live Gemini generation. Release IDs and screenshots are tracked in the owning workspace delivery receipt.

## 2026-09-29 - Checked source quotations and recoverable lookup failures

Source analysis now returns structured evidence, verifies each quote against the named uploaded file, and distinguishes partial support, conflicting evidence and no matching passage. A missing passage does not imply the original PDF lacks it. Gemini overload/quota failures preserve their status and have an explicit retry action; errors no longer become tutor evidence. The tutor treats the authored key as a claim to assess, not an authoritative source. PDF text imports identify embedded-image gaps. The shared prompt limit is now 1,000,000 characters to accommodate complete recovered sources without truncation.

Validation: 59 tests, TypeScript and production build; a real Chrome component check exercised provider-error display then successful manual retry. Tests include invented quotations/filenames, absent evidence, provider 503, no automatic retries, PDF-image warnings and preservation of existing private/cloud workflows. Clinical source repairs are private and are not committed here.

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
