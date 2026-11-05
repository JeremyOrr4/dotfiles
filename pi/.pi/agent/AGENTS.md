## Personal AI workspace: `.ai/`

- Personal AI work for a repository goes in `<repo-root>/.ai/`: handoffs in
  `.ai/handoffs/`; plans, notes, and other agent files in their own
  subfolders.
- Create `.ai/` only when there is something to save. When you create it, also
  create `.ai/.gitignore` containing `*`. Never stage or commit anything under
  `.ai/`.
- If `git ls-files .ai` prints anything, the repository tracks its own `.ai/`
  folder: do not use it, and ask the user where to put your files.
- At the start of a session, if `.ai/handoffs/` contains a file whose `branch`
  matches the current branch and whose `status` is not `closed`, tell the user
  ("There is a handoff for this branch from <updated>: <title>. Want me to
  resume it?") and wait. Do not read or act on it unless they say yes.
