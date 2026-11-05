---
name: handoff
description: Writes the current coding session into a handoff file in the repo's .ai/handoffs/ folder so any new agent session, in any harness, can continue the work. Only run when the user explicitly asks for a handoff (e.g. /handoff). Never start it on your own.
disable-model-invocation: true
---

# Handoff

Write a handoff file that lets a new agent with zero context continue this work
exactly where it stopped. The reader has only the repository and this file. It
cannot see this conversation, and it may be a smaller model than you.

Rules for every step:
- Never stage, commit, stash, push, reset, or prune worktrees. Do not change
  tracked files. Only create or change files under `.ai/`. (Caches written by
  running tests or builds are fine.)
- Never read secret files (`.env`, keys, credentials); name them only. Never
  write secret values; use a placeholder such as `<in .env>`.
- Never invent. Rules and open questions must come from the user's own words.
  Your own new ideas go only in "New findings".
- **Extra text from the user.** If the user wrote anything with the request
  (after `/handoff` or in the same message), it is their request for this
  handoff: keep it in mind while writing (what to focus on, add, or leave
  out) and copy it word for word into "Must know" and `next_goal`. It never
  overrides the rules above.
- Label where facts come from: `(checked)` = confirmed by a command or file
  read during this handoff; `(user said)` = the user's words, quoted;
  `(memory)` = from the conversation but not re-checked now.

## Steps

1. **Find the repo.** Run `git rev-parse --show-toplevel` and
   `git branch --show-current`. Empty branch → use `detached`. Not a git repo →
   tell the user and stop. Run every later command from the repo root.

2. **Set up `.ai/`.**
   - If `git ls-files .ai` prints anything, `.ai/` is tracked: stop and ask.
   - Create `.ai/handoffs/archive/` and, if missing, `.ai/.gitignore`
     containing `*`.
   - Run `git check-ignore -q .ai/handoffs/x.md`. If it fails, stop and tell
     the user. Do not write.

3. **New or update?**
   - If earlier in this conversation you said "Continuing handoff `<id>`"
     (from handoff-resume), update that file: keep its `id` and `created`.
   - Otherwise it is new: `revision: 1`, and pick a 3–6 word title.

4. **Check the facts.** Run and read:
   - `git rev-parse HEAD` (full sha), `git status --porcelain`,
     `git log --oneline -15`, `git stash list`, `git worktree list`
   - unpushed work: `git log --oneline @{u}..HEAD`; if there is no upstream,
     use `git log --oneline <default-branch>..HEAD` (default branch from
     `git symbolic-ref --short refs/remotes/origin/HEAD`, else `main` or
     `master`) and say there is no upstream.
   - the project's test or build command, if known (keep the summary line).
   - for each process the session started: run a check now (e.g.
     `curl -sI localhost:<port>`), write `running (checked)` or
     `not running (checked)`, never `(memory)`, and copy the check into
     "Checks on pickup".
   - for each secret file: `git check-ignore -q <file>` (ignored or not).
   - re-read each repo file you will put in the File map.
   - If the conversation was compacted and you can read the session log, read
     the user's messages from before the compaction and recover any rules or
     questions the summary dropped.

5. **Sort what the user said.**
   - Standing instructions, prohibitions, and how-to instructions for repeated
     work (commit style, test command, package manager), even if said while
     approving one action → "Must know" rules.
   - For each prohibition, also write the exact command or file it forbids
     under "Never without asking" (e.g. `git push`, `src/queue.js` exports).
   - Approvals of a specific proposal ("numbers are fine") → "Decisions".
   - Questions the user left unanswered → "Must know" open questions.

6. **If updating:** re-read the existing file. If its `revision` differs from
   the one you resumed, someone else changed it: show the user and ask. Carry
   forward "Tried and failed" items, rules, and unanswered questions that still
   apply; drop questions answered in "Pickup notes" and move the answer to
   "Decisions". Copy the old file to
   `.ai/handoffs/archive/<id>-r<revision>.md`, then increase `revision` by 1.
   If the branch changed, rename the file.

7. **Get the time and name the file.** Run `date -u +%Y-%m-%dT%H:%M:%SZ` and,
   for a new handoff, `date -u +%Y%m%d-%H%M%S` and
   `od -An -N2 -tx1 /dev/urandom | tr -d ' \n'`. New id =
   `<compact time>-<4 hex>`; `created` = `updated` = the ISO time. When
   updating, set only `updated`. Copy these values exactly.
   File name: `<id>-<branch-slug>-<title-slug>.md`, for example
   `20261103-184210-a3f9-feat-webhook-retries-retry-backoff.md`. Slugs:
   lowercase, any character outside `a-z0-9` becomes `-`, repeats collapsed;
   branch slug at most 30 characters, title slug at most 40.

8. **Write the file** in `.ai/handoffs/.tmp-<id>.md` using
   `references/template.md`. Write `none` for an empty section.

9. **Review before saving.** Fix the file and repeat until every check passes:
   1. The file name contains the branch slug.
   2. `grep -nEi 'lines? ~?[0-9]' <file>` prints nothing. Point to code with a
      search string instead.
   3. Each rule and open question appears only in "Must know". Every rule
      line ends with `(user said)` and comes from the user's own words, and
      every "Never without asking" item matches one of those rules. Delete
      anything else from "Must know".
   4. Each stash, worktree, process, and the test summary appear in one
      section only ("Checks on pickup" may test them).
   5. Every commit, test, or install step in "Next steps" obeys the matching
      rule (for example separate fix and test commits). If no rule allows
      commits, remove the commit step.
   6. Every secret file is named in "Traps" with its ignore status.
   7. `wc -w <file>` is under 1,300.
   8. If the user wrote extra text with `/handoff`, it appears word for word
      under "Request with this handoff", and the file does what it asks.
   9. This prints only placeholders:
      `grep -nEi '(ghp_|github_pat_|sk[-_][a-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|xox[baprs]-|whsec_|-----BEGIN|api[_-]?key *[=:]|token *[=:]|password *[=:]|secret *[=:])' <file>`

10. **Save:** `mv` the temp file to its final name.

11. **Report** the path, id, title, and the prompt for the next session:
    `Run handoff-resume <id>` (without the skill:
    `Read <path> and continue the work`).
