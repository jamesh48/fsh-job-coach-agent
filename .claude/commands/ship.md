You are doing a pre-commit review for the FSH Agent project. Follow these steps:

## 1. Gather context

Run these commands and read the output:
- `git diff HEAD` — all uncommitted changes (staged + unstaged)
- `git diff --cached` — staged only (if HEAD diff is empty, a commit may already be staged)
- `git status` — overall state
- `git log --oneline -10` — recent commit history for context

Read any files that were changed but whose full context is needed to evaluate correctness.

## 2. Review the diff

Evaluate the changes against the following criteria:

**Completeness**
- Does the implementation fully satisfy the feature or fix that was being worked on?
- Are there any half-finished pieces (TODOs, placeholder logic, missing wiring)?

**Edge cases**
- What happens on network failure, expired tokens, or unexpected API responses?
- Are async errors caught — either in a `try/catch` or passed to a callback (never unhandled)?
- Are loading/async states handled in the renderer (disabled buttons, snackbar feedback)?

**Correctness against conventions** (from CLAUDE.md)
- `browserWindow` is checked for null and recreated with `createBrowserWindow()` before use
- Events flow IPC-first: `mainWindow.webContents.send('event', ...)` is called before `broadcast()` so the renderer is never blocked by backend forwarding failures
- New IPC handlers are registered in `ipcMain.handle` in `src/main/index.ts` and exposed via `contextBridge` in `src/preload/index.ts`
- Node built-in imports use the `node:` protocol (e.g. `node:path`, `node:http`)
- `electron-store` is used for all persistent state — no other persistence mechanism
- `ws.send()` calls always use an error callback, never fire-and-forget
- New watchers/intervals are always paired with a corresponding stop function that clears both the interval and any alignment timeout
- Biome has been run (`yarn lint`) and reports no issues

**Reusability & deduplication**
- Does any new logic duplicate something already in a util or existing module?
- If a new watcher was added, does it follow the same start/stop/align pattern as `gmail.ts` and `calendar.ts`?

**Value / quality**
- Is there anything obviously missing that would make this feature more useful or robust?
- Any patterns here that differ from how similar features are built in the rest of the codebase?

## 3. Summarize findings

Respond with:

### Status
One of: ✅ Ready to commit | ⚠️ Minor issues | ❌ Issues to fix

### What looks good
Brief bullets on what is solid.

### Issues / recommendations
Numbered list. For each item: what it is, why it matters, and a short code snippet or suggested fix if applicable. Separate "must fix before commit" from "nice to have."

### Suggested commit message
Two parts:

1. **Subject line** — a concise conventional-style one-liner (e.g. `fix: persist seenEmailIds across restarts`)
2. **Body** — 2–4 sentences explaining *why* the change was made, any non-obvious decisions, and what problem it solves. Written in plain prose, present tense. Omit if the subject line is fully self-explanatory.

## 4. Update CLAUDE.md

After the review, scan the diff for anything that should be reflected in CLAUDE.md but isn't already there:
- New libraries or dependencies added
- New architectural patterns or conventions established
- New watchers, IPC handlers, or store keys added
- Anything that future-Claude would need to know to work on this codebase effectively

If you find anything, update CLAUDE.md directly. Be concise — add to the right existing section rather than appending a new one unless it's genuinely a new category. Do not duplicate what's already there.

## 5. Commit and push

If there are any "nice to have" optimizations (non-blocking issues from step 3), present a numbered choice **before** asking about the commit message:

> **Before committing, I found some optional optimizations:**
> - [list them briefly]
>
> How would you like to proceed?
> 1. Commit and push as-is
> 2. Introduce the optimizations first

Wait for the user to choose. If they choose 2, make the changes, re-run `yarn lint`, then return to step 3 to re-evaluate. If they choose 1 (or there were no optimizations), proceed with the commit.

Ask the user: "Would you like me to commit and push with the message: `<suggested commit message>`?" and show the full subject + body so they can review it before confirming.

If the user confirms:
1. Stage all changed files with `git add` (specific files, not `-A`)
2. Commit using the suggested subject line and body, appended with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`. Pass the full message via a heredoc so multi-line formatting is preserved.
3. Push to the current branch with `git push`
4. Report the result

If the user declines or requests a different message, adjust accordingly or stop.
