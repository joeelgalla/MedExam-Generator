# Import and share exams

Open `/practice.html`. Import a reviewed `.exam.json` file, then start the timed exam. Answers, flags and completed attempts are saved in browser storage at this origin. There is no account, cloud sync, AI generation or tutor on this page. Download a backup before moving to another device or preview address. A changed deployment address has separate browser storage.

The sign-in screen and project list both link to **Import & share exams**. **Share exam** downloads an exam-only file and supplies a message with the app address. Send both to a friend; they import the file and start with empty answers and their own timer/history. The share includes the grading key for local marking, hidden in the interface until submission. It does not include your answers, flags or attempts. **Download backup** is for transferring your own progress, not sharing a fresh exam.

This is a separate entry in the existing app. The normal `/` page retains the original cloud workflow. No database migration is required. Private exams must never be imported into that cloud workflow. Do not commit course documents, private question banks, objective catalogs or backups to this public repository.

## Running and verification

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run preview -- --host 127.0.0.1 --port 4174
```

Tailwind is compiled for the private page at build time; the original page's styling is unchanged. `npm run dev` also generates the private CSS at startup. After changing utility classes during development, rerun `npm run build:practice-css`.

Use the synthetic fixture in `tests/fixtures.ts` for browser tests. It contains no medical or course material. The production practice HTML permits only local scripts/styles and disables network connections with CSP. Vercel preview API handlers also reject paid AI requests before constructing a model client. `DISABLE_AI=1` disables them in other environments; it is not an authentication system. Production API authentication and the historic generation failure remain separate work.

## Import contract

Root fields: `format: "medexam-practice"`, `version: 1`, `examId`, `title`, integer `durationMinutes` (1–240), `instructions`, `registry`, and `questions` (1–200).

The registry has an `id`, a `buckets` dictionary of ID to label, a `topics` dictionary of ID to `{title, bucketId}`, and an `objectives` dictionary of unique row ID to `{topicId}`. The import checks relationships as well as identifier existence. A registry should be reviewed against its authoritative curriculum; structural validation cannot establish that the catalog itself is authoritative.

Questions retain the app's existing `ExamQuestion` shape. Private imports additionally require `metadata.itemId`, `objectiveIds`, `topicId` and `bucketId`. Optional `caseId` identifies a shared case; the vignette is repeated in each question. Optional `sources` entries carry `title`, `page`, `url` (HTTPS) and `accessed`. All content is plain text. Stable item IDs identify repeats within a registry. New metadata fields remain optional for existing cloud projects.

`Download backup` exports the complete private state as `.practice-backup.json`. Restore validates the whole file before merging it, retains existing history, deduplicates identical attempt IDs, and rejects conflicting histories or an active local exam. Old backups do not revive a locally completed attempt. Files are limited to 10 MB; storage capacity varies by browser. A failed write shows a red banner and keeps the unsaved state in memory for export. Never clear browser data to resolve a save error before exporting it.

The timer uses a saved absolute deadline and continues across refreshes or closed tabs. After expiry, late answer changes are rejected and the attempt is submitted once. This is practice software, not a secure examination or proctoring system. Small bucket samples are displayed as counts, never as mastery claims.
