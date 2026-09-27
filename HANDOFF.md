# Handoff

## 2026-09-26 — Import/share release

Joe asked to finish friend sharing and make the mode usable from the normal app. Added links from sign-in and project list; exam-only export and a copyable friend message preserve each learner's answers/history separately. 23 tests, typecheck and build passed. Browser share download/copy and fresh-learner import/start passed. Production question-model default is retained to avoid coupling this release to the unconfirmed generator repair. No database changes. Private question files remain outside git and hosting.

## 2026-09-26 — Private practice preview in progress

Branch `codex/fm-private-practice` starts at `87d38f7`. Build an isolated, browser-local practice route for imported, reviewed exams; preserve the existing cloud app and projects. No database migrations, production deployment, or merge to main. Keep all course documents, objective catalogs, private exams and recalled exam material outside this public repository and hosting bundle. Use synthetic fixtures only for tests.

Minimum scope: validated exam imports, stable item and objective IDs, saved answers and flags, a resumable timer, review/history, backup export and visible persistence failures. Disable paid AI handlers on preview deployments. Existing cloud authentication and storage remain separate.

Vercel/Supabase connectors are not exposed to this Codex thread as of startup. The database host resolves; restoration and retained data counts were reported by the separate Claude audit, not queried here. The authenticated Vercel dashboard is accessible through Chrome. Its Hobby log time picker offers the last hour; the earlier reported generation failure is outside that window. The upstream error remains unconfirmed. No paid AI test calls were made.

Implementation is in `practice.html`, `practice.tsx`, `components/PrivatePractice.tsx` and `services/privatePractice.ts`. Imported data is validated against its accompanying registry; no curriculum registry is bundled. Static CSS avoids the cloud page's external scripts. Production CSP blocks connections from this page. The original app entry, cloud storage and authentication are unchanged. QuestionCard now escapes the original vignette before supporting local highlights and suppresses metadata hints/tutor controls in private mode.

Validation: 22 automated tests cover the import/state/timer helpers, rendering of old cloud cards versus private cards, and all four API handlers rejecting preview requests before model access. Chrome import → start → answer → flag → reload → submit → export → restore passed with synthetic data. Recovered 1 correct / 3 total, 2 answered and one flag; restoring the same backup did not duplicate history. Restoring an expired attempt auto-submitted once. Importing again retained both histories and showed the repeated-item count. A simulated storage quota failure produced the visible not-saved banner; restoring storage and retrying saved successfully. A second tab was blocked by the writer lock. At a 390px device viewport the document width and scroll width both measured 390px. Zero network request events were recorded during backup import/expiry; no framework errors were logged.

Dependency audit: both baseline `87d38f7` and this branch report the same 16 production-dependency advisories (1 low, 3 moderate, 10 high, 2 critical). No new production package advisories. Dependency upgrades are not mixed into this preview; the pre-existing backend/tooling advisories need separate work. TypeScript/build success is not a clean security audit.
