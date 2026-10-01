# MedExam Generator

Reusable study projects for medical rotations: keep learning objectives, topic references, question-writing instructions, original worked examples, exams and personal progress together.

## Use the app

Open https://med-exam-generator.vercel.app/ and **sign in** to keep projects and progress in your account across devices. **On this device** is an optional mode that stays in one browser. The standalone player remains at `/practice.html`.

1. Create a project or choose **Import project** for a friend's `.medexam` file. Each project uses the same **Exams**, **Progress** and **Materials** navigation.
2. In **Materials**, add objectives and notes. In **Exams → Generate an exam**, choose length, time limit, difficulty and topics, then generate. Questions are saved first; the timer starts only when you choose **Start exam**.
3. **Import an exam** adds a JSON file or pasted JSON without replacing existing exams or progress. It complements the built-in generator.
4. Take an exam, then review explanations. **Continue exam** preserves unfinished answers and the original deadline. **Progress** includes earlier exams, including projects created before the reusable exam library.
5. Prefer your own AI? The optional section inside **Generate an exam** explains how to download the same instructions and materials, attach them to ChatGPT/Claude, and import the result. Built-in generation supports up to 20 questions per request; no automatic paid retries occur.
6. **Share project** opens a download dialog with copyable instructions for your friend. They get an independent copy with fresh progress. **Download exam** shares a single question set. Private backups and recovery are in a separate collapsed section.

When another browser tab controls a project, choose **Use this tab** to hand over after saving. Closing the controlling tab also releases the project automatically. AI availability is checked before generation; observed quota exhaustion is remembered for the browser session until **Check again**. The availability check does not consume Gemini quota or prove that quota remains.

Shared files can be imported into your account after confirming the cloud upload. For an existing device project, use **Sign in to save to account**, then **Save to account**. This preserves its sources, exams, answers, flags and timer, keeps the original device copy as a backup, and opens the saved account project. Retrying uses the same account-scoped ID. Account storage and Gemini permission are separate; transferring a device project does not turn Gemini on. Keep held-out exam recalls out of project source files and examples.


Generation plans knowledge objectives from the project registry, prioritizing missed or blank submitted answers and tasks not yet assessed. **Progress → Practise gaps and recent misses** opens this mode directly. Each set uses up to six topics with complete chapters, rotating through remaining topics over later sets. The coverage view includes objectives with no question yet and separately identifies performance skills; one correct item is not whole-objective mastery.

Before a generated set is saved, a separate Pro solve receives unlabelled choices and the study text, without the writer’s answer or explanation. Exact source passages, mapped objectives, criteria and distractors are checked; passing items can be retained when others fail. Excluded tasks remain gaps, and there are no automatic paid retries. Feedback and quoted passages are available after submission and in past-question review. This is an AI check against uploaded text, not clinical certification or a guarantee of real-exam difficulty. Imported external exams retain their import validation; they do not automatically receive this provider check.

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

### Revising an imported exam

An intentional edit can reuse `examId` with a higher positive integer `contentRevision` (omitted means 1). Re-importing replaces that saved bank for future attempts. Completed reviews and unfinished attempts retain the questions originally shown. Older revisions cannot downgrade a bank; conflicting content with the same revision is rejected. Share exports retain the revision.
