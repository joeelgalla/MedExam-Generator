# MedExam Generator

Reusable study projects for medical rotations: keep learning objectives, topic references, question-writing instructions, original worked examples, exams and personal progress together.

## Use the app

Open https://med-exam-generator.vercel.app/ and choose **On this device** for a project that stays in that browser, or sign in for account projects. The standalone player remains at `/practice.html`.

1. Create a project or **Import** a shared `.medexam` file.
2. Open it and start a saved exam, **Import exam** from a JSON file, or **Paste exam JSON**.
3. Questions, answers, flags and the original timer deadline are saved. Submit to review explanations and see progress by topic, bucket and objective. Unanswered questions are excluded from weakness calculations.
4. For another exam, expand **Make the next exam with your AI**, choose sections/settings, **Download AI packet**, and **Copy prompt**. Attach the packet to your AI, then import the returned JSON into this project.
5. Built-in generation uses the same instructions, references, worked examples and answered-question evidence. It supports up to 20 questions per request. Use the packet/import route for a full 60-question mock. A shorter valid response is saved with its actual count; there is no automatic paid retry.
6. **Share this project** exports the recipe, objectives and optionally references/exams. The recipient gets a new project with empty progress. **Share exam** exports only that exam and its grading key. **Download private backup** includes personal work and is for recovery, not sharing.

A shared project is marked for device storage to prevent an accidental cloud upload. Each learner explicitly enables online AI for a device project before material can be sent through generation or tutor requests. Keep held-out exam recalls out of project source files and examples.

## Data and compatibility

- Old cloud projects and free-text objectives remain supported. New optional metadata includes `objectiveIds`, `topicId`, `bucketId`, `itemId` and `caseId` inside existing JSONB data; no database migration is required.
- New exam imports are additive. A running exam must be finished or set aside before another starts. An unfinished draft does not count as an attempt; its original timer still runs.
- Standalone-player backups can be merged using **Restore practice history**. Re-importing an identical backup does not duplicate attempts.
- Device projects use IndexedDB. Cloud projects keep a device recovery copy, display sync failures, merge completed attempts and exams, and use a conditional timestamp update to reject stale writes. Conflicting device data is retained as a separate local recovery project.
- A project is editable in one tab per browser at a time. Backups can move device projects to another browser/device; device projects do not automatically sync.
- JSON validation verifies structure, objective relationships and item identity. It does not certify clinical accuracy, equivalent exam difficulty or semantic uniqueness. Review original AI questions against reliable current clinical sources. Held-out recall comparison stays outside this app.

## Development

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Node with TypeScript stripping is needed for tests (tested with Node 26). Vite serves the frontend; Vercel serves `/api/*` in deployment. Local device imports work without cloud credentials. To run API routes locally, use a configured Vercel development environment.

Vercel environment variables:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: browser account access. Server auth can use these or `SUPABASE_URL` / `SUPABASE_ANON_KEY`.
- `GEMINI_API_KEY`: server only, never a `VITE_` variable.
- `AI_ALLOWED_USER_IDS`: required comma-separated account IDs for owner-approved built-in AI. Empty fails closed; new sign-ups do not automatically gain access to the owner's key.
- `GEMINI_QUESTION_MODEL`: optional Pro model override. Default `gemini-3.1-pro-preview`; retrieval/transcription/tutor routes retain Flash.

All four paid endpoints validate the bearer token with Supabase and enforce the allowlist before calling Gemini. Preview deployments disable AI. The shared question-writing rules are in `lib/examRules.ts`; `services/generationPrompt.ts` supplies the same project context to built-in generation and the external packet.

This repository is public. Never commit private references, course objectives, recalls, imported exams, project files or backups. Use synthetic fixtures for tests. See `AGENTS.md` for implementation invariants and `CHANGELOG.md` for validation limits.
