# Handoff

## 2026-11-09 - Exam list shows which sets are done (staged on `claude/exam-status`, not deployed)

Joe could not tell which saved exams he had finished: every card said "Retake exam" with an "N seen before" chip. Cause: a finished attempt (`ExamAttempt`) does not record the saved exam it came from, so since a324ae9 (2026-09-29) the card inferred status from question overlap. That worked while each set had its own questions; newer sets reuse bank questions, so any overlap made every card look taken. Presentational fix, no data writes: `services/examStatus.ts` links each finished attempt to the saved exam it matches by question IDs (at least 80% of the attempt and half of the exam, unique best Jaccard; the active exam's own attempt ID wins; ties stay unlinked). Cards show a green "Done · score" chip and a quieter "Retake exam" button; sets not taken keep the blue "Start exam", with the overlap count moved into the meta line; a done set that gained questions shows "N not yet seen". The heading shows "N of M done" and Previous attempts name the set. Unfinished attempts count only when they have answers ("Unfinished · N answered").

Typecheck, 108/108 tests (4 new) and build pass. The review chunk `privatePractice-BTx81gxQ.js` is unchanged; only `main-*.js` changes. A local preview with Joe's real exam list (titles and question IDs only, kept outside this repo) reproduces the live "seen before" counts and marks 4 of 12 done. Post-exam follow-up: record `examId` on new attempts in the submit path (`services/projectWorkflow.ts`, plus the import and merge validators) so status stops depending on matching. Deploy only after Joe approves; rollback is reverting the merge on `main`.

## 2026-11-09 - Compact answer review (deployed, 1c2ec37)

Joe reported the post-submit review page had become a wall of text. Since 2026-10-01 each reviewed question showed the explanation plus one "Passage from the study material" row per quote, an always-visible metadata block (task sampled, LOs, primary objective and every source title/page again), a "Find supporting passages" button and an always-open tutor chat. Presentational change only, no data or AI changes: sources, objectives and the author's note now sit in one closed "Sources & objectives (N)" disclosure (each source listed once: passages grouped by document, then link-only references); the tutor chat opens from an "Ask the AI Tutor" button beside "Find supporting passages" and keeps its conversation when closed; "Ask about this" on selected text opens the chat pre-filled. Same treatment in Progress review rows. The header no longer repeats the cluster when a question has no week. `SourcePassages.tsx` replaced by `ReviewSources.tsx` (added to the practice Tailwind content list).

Typecheck, 104/104 tests (one new) and build pass. Local preview with a private Set 10 fixture (kept outside this repo): full results page 14,137 px to 9,409 px at 1100 px width; select-to-ask, close/reopen, deep dive and Progress review rows checked in a browser. Joe approved the preview. `main` was fast-forwarded from 3c0b963 to 1c2ec37 and pushed at 2026-11-09 11:48 EST; tests, typecheck and build were rerun on `main` first. GitHub deployment 7660664613 (Production) reports success, and the live `privatePractice-BTx81gxQ.js` chunk has the same name as the local build and contains the new controls. Not yet checked in a signed-in live session. Rollback: revert 1c2ec37 on `main` and push (about 2 minutes), or promote the previous deployment in the Vercel dashboard.

## 2026-11-08 - Upgraded question generation default to Gemini 3.8 Flash to prevent 20-question 504 timeouts

A live 20-question Hard Psychiatry generation attempt (`654,035` characters / `142,658` prompt tokens + `14,062` output tokens) authenticated on Vertex AI (`ai-assistant-cli-490505`) but timed out at 167s (`504 DEADLINE_EXCEEDED`) on `gemini-3.1-pro-preview` during the writer pass (`httpOptions.timeout: 170000`). Upgraded `DEFAULT_QUESTION_MODEL` in `lib/server/geminiClient.ts` to `gemini-3.8-flash` (overridable via `GEMINI_QUESTION_MODEL`), raised the writer timeout in `api/generate.ts` to `210000` (210s), and added explicit `504 DEADLINE_EXCEEDED` classification in `lib/server/generationError.ts`. On the exact 654k-character 20-question Psychiatry prompt, `gemini-3.8-flash` (`ThinkingLevel.MEDIUM`) completed the 20-question writer pass in 87.2s and the 6-batch blind verifier pass in 59.9s (147.1s total within Vercel Fluid's 300s limit). All 103 automated tests, TypeScript, and production build pass.

## 2026-11-08 - Restored exam task tags and enforced harder generation

Cognitive-level names (Recall, Understanding, Application) and question subtypes are visible during active cloud and standalone exams again. Topic/objective hints remain post-submit. The generation checker now classifies cognitive level and subtype independently and replaces writer labels; hard/expert generation rejects items assessed as foundational. Writer instructions explicitly reject tone-based elimination and require answer-determining case details. No fixed cognitive quotas or claim of validated ME difficulty.

103 tests, TypeScript and production build pass. The separate annotation/all-account-AI change is deployed as PR19 / 6beed57 and eleven production Chrome checks pass. Only the existing favicon 404 occurred. Private Psychiatry-bank difficulty/metadata revision is separate from this public code change.


## 2026-11-08 - Reversible annotations and AI access for all accounts

Joe requested highlight-before-select, unhighlighting and strikethrough, then explicitly requested Gemini access for everybody. Replaced vignette DOM wrapping with plain-text offset annotations: persistent tool selection, selection-first toggles, partial erasing, overlapping highlights/strikes, lead-in/option support, and independent choice elimination. Answer selection is suppressed during drag selection; keyboard answer selection remains available. Annotation state remains local to the mounted question, like the previous highlighter.

Removed the owner AI allowlist from the shared authorization check. Every remotely verified, signed-in non-anonymous account can use generation, tutor, source analysis and OCR; preview disabling and token validation remain. No database or provider changes. Regression tests cover the updated access policy, invalid/anonymous token denial, and annotation overlap/removal. 102 tests, typecheck and build pass. Isolated Chrome exercised eleven interaction/layout checks at desktop and 390px; only the existing missing favicon warning occurred. Deployment/readback pending. Private QA artifacts are outside this public repo.


## 2026-11-08 - Vertex AI routing and Gemini 3.8 Flash migration

All server AI routes (`/api/generate`, `/api/analyze`, `/api/chat`, `/api/ocr`, and `/api/ai-status`) now share `lib/server/geminiClient.ts`, preferring Google Cloud Vertex AI service-account credentials (`GOOGLE_VERTEX_CREDENTIALS_JSON`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`) so requests draw from standard Cloud Billing and the monthly Google AI Pro Cloud credit instead of the depleted AI Studio prepay wallet (`HTTP 402`), while preserving `GEMINI_API_KEY` fallback. Upgraded the default fast model for `/api/analyze`, `/api/chat`, and `/api/ocr` from deprecated `gemini-2.5-flash` (which returns `404` on Vertex `global`) to `gemini-3.8-flash` (overridable via `GEMINI_FLASH_MODEL`), keeping `gemini-3.1-pro-preview` (overridable via `GEMINI_QUESTION_MODEL`) for `/api/generate` and `verifyDraft`. All 99 automated tests, TypeScript, production build, and live Vertex AI E2E checks across `/api/analyze`, `/api/chat`, and `/api/generate` + `verifyDraft` pass.

## 2026-11-08 - Review search and coverage scope

An independent design audit identified that review search omitted visible objective IDs and facts in options/explanations. Search now includes those fields. Coverage explains that its denominator is the project objective list, not all required modules or clinical competence. Post-submit source labels distinguish supplemental references and the primary objective; empty objective arrays no longer render a stray zero. No learner, scoring, model or billing changes. All 98 tests, TypeScript and the production build pass. Deployed UI readback pending.

## 2026-11-08 - Calibrated progress guidance and narrow layout

An isolated five-question live test showed the guidance overgeneralizing two flags as broad uncertainty. Guidance now refers to the actual sampled questions and avoids inferring overall ability from flags or a few cognitive-level items. At the browser's observed 288px layout width, navigation and review tabs overflowed; the header navigation now wraps and analytics tabs use two columns below the small breakpoint. 98 tests, typecheck and production build pass. Live deployment layout readback is pending.

## 2026-11-08 - Complete cited teaching context

Cross-topic imported questions can cite secondary teaching chapters absent from their primary objective topic. Tutor source selection and planned-question generation now include those complete attached chapters by exact cited filename; private recall examples remain excluded and course-first generation still excludes supplements. Added tutor input/send accessible names. 98 tests, typecheck and production build pass, including a cross-topic citation regression.

## 2026-11-08 - Live Gemini billing result

Import repair is deployed from PR #14. A real authorized generation request now reaches Gemini, which returns HTTP 402: prepaid credits depleted. Added explicit billing handling before generic RESOURCE_EXHAUSTED/rate-limit handling for generation, source analysis, tutor and extraction. All 97 tests, typecheck and build pass; SDK transport fixtures verify one call per route and actionable 402 feedback. No credit purchase or billing configuration change.

## 2026-11-08 - Production generation import repair

An authorized isolated-account browser test reached `/api/generate`, which crashed before model access: the deployed `generationVerifier.js` imported a nonexistent `services/generationEvidence.ts`. Enable TypeScript's relative extension rewriting so emitted server imports target emitted JavaScript throughout the dependency graph. Added a regression test that compiles and imports the real generation handler without its TypeScript sources, plus defensive response parsing for plain-text hosting errors. Local validation: 96 tests, typecheck and production build passed. Live deployment/retest outcome is pending; private study content and evidence stay outside this repository.

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

## 2026-09-27 - Live generation blocked by provider billing

One authorized production browser generation reached Google and returned 429 with free-tier Pro quota limit 0. AI Studio showed the linked billing account as inactive/unsupported; Cloud billing appeared paid, and AI Studio billing setup returned a system error. No new exam was generated. The owner must resolve provider billing before a successful end-to-end generation can be claimed. Do not repeatedly test a known zero quota. Source-sharing permission is settled and the project remains enabled; this is not an app consent gate.

## 2026-09-27 - Generation readiness audit

Claude partner reviewed the complete generation/import/account/history loop and found no reproducible data-loss defect. Addressed missing required registry fields in the Gemini response schema and malformed optional citation failures; added content-free token-usage logging. Joe approved sending relevant project sources to Gemini and the live generation test. The final private receipt owns the live result; mocked tests alone are not end-to-end proof. Cloud save and readback were already verified interactively.

## 2026-09-27 - Account storage correction

Joe explicitly rejected device-only FM delivery. Added account import approval and a direct Save to account path that preserves material, banks, history and unfinished timers. Cloud storage and Gemini consent are separate. Sign-in is required before the real account transfer; do not label the FM project cloud-saved without the observed write/readback. No raw course material belongs in this public repository.


## 2026-09-27 - Project workflow release

Joe requested implementation and finalization after Claude partner review. Branch `codex/project-workflow` extends existing projects rather than replacing the app. All curriculum, exams and review transcripts remain outside this public repo. README documents the complete workflow and current limits. Local imports work without login; cloud data belongs to the authenticated account. No schema migration.

The production AI allowlist retains the three existing non-test project-owner IDs. The verified disposable tester account is excluded; no new account is enabled. The setting takes effect on the new deployment. Paid live-generation and private-course-upload approvals were asked separately and are still pending. Do not run a billable call or upload course data just because mocked tests passed. Read the private delivery receipt for deployment IDs and remaining user actions.

## 2026-09-27 - Finalization in progress

The newly connected Vercel connector confirms the generator failure: retired model `gemini-3-pro-preview` returned 404 on 2026-09-26 at 22:59:45 UTC. Replacement default and mocked transport regression check are on `codex/fm-finalize`; 24 tests, typecheck and build pass. No database changes or paid API calls. Clinical exam files remain outside this public repository.

## 2026-09-26 — Import/share release

Joe asked to finish friend sharing and make the mode usable from the normal app. Added links from sign-in and project list; exam-only export and a copyable friend message preserve each learner's answers/history separately. 23 tests, typecheck and build passed. Browser share download/copy and fresh-learner import/start passed. Production question-model default is retained to avoid coupling this release to the unconfirmed generator repair. No database changes. Private question files remain outside git and hosting.

## 2026-09-26 — Private practice preview in progress

Branch `codex/fm-private-practice` starts at `87d38f7`. Build an isolated, browser-local practice route for imported, reviewed exams; preserve the existing cloud app and projects. No database migrations, production deployment, or merge to main. Keep all course documents, objective catalogs, private exams and recalled exam material outside this public repository and hosting bundle. Use synthetic fixtures only for tests.

Minimum scope: validated exam imports, stable item and objective IDs, saved answers and flags, a resumable timer, review/history, backup export and visible persistence failures. Disable paid AI handlers on preview deployments. Existing cloud authentication and storage remain separate.

Vercel/Supabase connectors are not exposed to this Codex thread as of startup. The database host resolves; restoration and retained data counts were reported by the separate Claude audit, not queried here. The authenticated Vercel dashboard is accessible through Chrome. Its Hobby log time picker offers the last hour; the earlier reported generation failure is outside that window. The upstream error remains unconfirmed. No paid AI test calls were made.

Implementation is in `practice.html`, `practice.tsx`, `components/PrivatePractice.tsx` and `services/privatePractice.ts`. Imported data is validated against its accompanying registry; no curriculum registry is bundled. Static CSS avoids the cloud page's external scripts. Production CSP blocks connections from this page. The original app entry, cloud storage and authentication are unchanged. QuestionCard now escapes the original vignette before supporting local highlights and suppresses metadata hints/tutor controls in private mode.

Validation: 22 automated tests cover the import/state/timer helpers, rendering of old cloud cards versus private cards, and all four API handlers rejecting preview requests before model access. Chrome import → start → answer → flag → reload → submit → export → restore passed with synthetic data. Recovered 1 correct / 3 total, 2 answered and one flag; restoring the same backup did not duplicate history. Restoring an expired attempt auto-submitted once. Importing again retained both histories and showed the repeated-item count. A simulated storage quota failure produced the visible not-saved banner; restoring storage and retrying saved successfully. A second tab was blocked by the writer lock. At a 390px device viewport the document width and scroll width both measured 390px. Zero network request events were recorded during backup import/expiry; no framework errors were logged.

Dependency audit: both baseline `87d38f7` and this branch report the same 16 production-dependency advisories (1 low, 3 moderate, 10 high, 2 critical). No new production package advisories. Dependency upgrades are not mixed into this preview; the pre-existing backend/tooling advisories need separate work. TypeScript/build success is not a clean security audit.
