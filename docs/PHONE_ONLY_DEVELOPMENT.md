# VÉRIA — Phone-Only Development (Android 10)

**Source of truth:** `https://github.com/eloravale/ve-rie` — `main`

**Only the phone browser is needed.** No local Git, Node, npm, Vite, wrangler, or Cloudflare CLI on the phone.

## 1. Open VÉRIA from an Android phone

1. Open Chrome (or another mobile browser) on the Android phone.
2. Go to `https://github.com/eloravale/ve-rie`.
3. There is nothing else to install. This repo is the recovery source if anything else goes wrong.

## 2. Reconnect Freebuff to the correct project

Freebuff reconnects by project identity. For this project that identity is stored in the repo as:

- `./.freebuff/project-id` — value: `53c0e4d4-26dd-42b3-aee4-e44a6b7b5cef`

So a future Freebuff session reconnects to this project by opening the **same** repo-backed project, not by re-pasting a URL.

Practical reconnect steps from the phone:

1. Open Freebuff in the browser.
2. Sign in to the same Freebuff account.
3. Open the existing VÉRIA project/workspace if it still exists, **or** create a new Freebuff project and point it at `https://github.com/eloravale/ve-rie`.
4. If Freebuff asks for the repo, use exactly:
   - owner/repo: `eloravale/ve-rie`
   - branch: `main`

If the previous Freebuff workspace is gone, you do **not** need it. Recreate from GitHub: clone (in Freebuff's cloud environment) `eloravale/ve-rie`, branch `main`, and continue. The `.freebuff/project-id` file inside the repo helps Freebuff recognize this as the same project when it is present.

## 3. Verify the repository is `eloravale/ve-rie`

In Freebuff's terminal/run panel, run:

```bash
git remote -v
```

Expected:

- fetch/push → `https://github.com/eloravale/ve-rie.git`

If that is not what you see, stop and confirm the repo before doing anything else.

Also confirm the branch and commit (next sections).

## 4. Verify the current branch

```bash
git branch --show-current
```

Expected: `main`

## 5. Verify the current commit

```bash
git rev-parse HEAD
git log -1 --oneline
```

The commit shown here is whatever is currently on `main`. Do not assume a specific SHA across sessions — read it each time.

## 6. Inspect git status

Always start a session with:

```bash
git status --short
git diff --stat
```

If the tree is clean and `origin/main` matches, there is nothing pending.

## 7. Ask Freebuff to implement a change

Use the reusable prompt in the section below. In short:

1. Open the VÉRIA project in Freebuff from the phone.
2. Paste the prompt, replacing `[DESCRIBE ONE SPECIFIC TASK HERE]`.
3. Read what Freebuff did.
4. If you want, ask Freebuff to run the checks in section 8 before committing.

## 8. Ask Freebuff to test the change

Ask Freebuff to run, in order:

```bash
npm run build:worker
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Then ask Freebuff to show:

- `git status --short`
- `git diff --stat`
- the test result summary
- the typecheck result
- the lint result
- the build result

## 9. Ask Freebuff to commit

Do **not** commit blindly. The safest request is:

> Review git status, git diff, and the test/typecheck/lint/build results above.
> Commit only the files related to the task, with a clear message.
> Tell me the files that will be committed and the commit message before committing.

Then, after Freebuff reports the planned commit, ask it to commit.

## 10. Ask Freebuff to push

Only after a successful commit and successful checks, ask:

> Push `main` to `origin/main` and confirm the result.

Freebuff should report the push result and the commit SHA.

## 11. Verify the push on GitHub

Open in the phone browser:

- `https://github.com/eloravale/ve-rie/commits/main`

Confirm the latest commit is the one Freebuff reported and that it is on `main`.

## 12. If Freebuff starts from a fresh environment

From a clean Freebuff session, the repo can be reconstructed from GitHub:

1. Open Freebuff.
2. Open/create a project for `eloravale/ve-rie`.
3. Use branch `main`.
4. Install dependencies: `npm install`
5. Build the worker: `npm run build:worker`
6. Run tests: `npm test`
7. Typecheck: `npx tsc --noEmit`
8. Lint: `npm run lint`
9. Build: `npm run build`

If the previous session's `.freebuff/` runtime state is missing, that is fine — those files are not required to continue development. The `.freebuff/project-id` file helps Freebuff recognize the project if present.

## 13. What must never be stored in prompts

Never paste into a prompt:

- `VERIA_ADMIN_TOKEN` or any real secret
- `wrangler` secrets
- any `.env` content
- GitHub Personal Access Tokens
- passwords, API keys, or credentials

Those belong only in GitHub secret storage / wrangler secret storage, never in chat.

## 14. If the workspace is missing or appears disconnected

1. Confirm the repo URL is `https://github.com/eloravale/ve-rie`.
2. Confirm branch `main` is checked out.
3. Confirm `git status` is clean (or that any dirty state makes sense for the task).
4. If the Freebuff project itself is gone, recreate a Freebuff project for the same GitHub repo. GitHub is the recovery source; the previous Freebuff environment is not required.
5. If `./.freebuff/project-id` exists in the repo and matches the prior project, that improves the chance Freebuff recognizes it as the same project.

## 15. If a build/test fails

1. Read the failure output in Freebuff.
2. Ask Freebuff to show the relevant `git diff` so the change is visible.
3. If the failure is from a real code change, ask Freebuff to fix it and re-run the checks.
4. If the failure looks like a stale build/worker artifact, ask Freebuff to run `npm run build:worker` and then re-run tests.
5. If a failure is unrelated to your task, stop and report it before pushing.

## Standard Mobile Development Prompt

--------------------------------------------------

We are continuing development of the existing VÉRIA repository.

Repository:
eloravale/ve-rie

Before doing anything:

1. Inspect git status.
2. Inspect current branch.
3. Inspect current commit.
4. Confirm origin/main.
5. Confirm the working tree state.

TASK:
[DESCRIBE ONE SPECIFIC TASK HERE]

Rules:

- Do not modify unrelated files.
- Do not rewrite existing architecture.
- Do not remove working functionality.
- Do not introduce new dependencies unless necessary.
- Do not modify database schema unless required.
- Do not change production behavior outside this task.
- Run relevant tests.
- Run typecheck.
- Run lint.
- Run build.
- Review git diff.
- Report all changed files.
- Report all tests/build results.
- Commit only after verification.
- Push to origin/main only after successful verification.
- Report the final commit SHA.

Stop if anything unexpected is discovered.

--------------------------------------------------

## Verification commands (phone copies these from Freebuff output if needed)

```bash
npm install
npm run build:worker
npm test
npx tsc --noEmit
npm run lint
npm run build
```

For a fresh local demo server (Freebuff cloud preview, not production):

```bash
npm run build
node server.mjs
```

Then open the Freebuff preview URL shown for that session.

## What is intentionally NOT committed

- `node_modules/`
- `dist/` and `dist-worker/`
- `.wrangler/`
- `*.db`, `*.db-shm`, `*.db-wal` (runtime SQLite files)
- `.env`, `.env.*`
- `.freebuff/*` (except `.freebuff/project-id`)
- `*.log`

Those are regenerated or are ephemeral. Nothing application-critical is missing from GitHub.

## Known constraints and risks

- The phone is only the interface. Build/test/typecheck/lint/push all happen in Freebuff's cloud environment and/or GitHub.
- A Freebuff preview launched from the cloud is **not** production. It is a temporary preview of the built app.
- Secrets (for example `VERIA_ADMIN_TOKEN`) are not in the repo and must be configured separately in the deployment environment, not in chat.
- If a Freebuff session loses its runtime state, reconnect via GitHub and the `.freebuff/project-id` anchor.
