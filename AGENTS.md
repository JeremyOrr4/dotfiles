# Dotfiles repository guidance

This repository manages personal configuration with GNU Stow. Read the relevant
files before editing; don't assume the layout or installed application versions.
Preserve unrelated work and never stage, commit, push, or close issues unless
explicitly asked.

## Repository-wide workflow

- Top-level directories are Stow packages, except `docs/`; `install.sh` stows
  packages into `$HOME`.
- Check `git status` before and after edits. Don't revert or overwrite changes
  you didn't make.
- Make the smallest change that solves the request and keep secrets, local
  machine state, generated files, and upstream vendored code out of commits.
- Test with the relevant application's actual version when possible. Clearly
  distinguish a syntax/headless test from testing in a running application.
- Ask before installing software, changing machine state, or performing remote
  actions such as GitHub operations.

## `nvim/` — Neovim

- Config root: `nvim/.config/nvim/`; this is a LazyVim config using `lazy.nvim`.
- User plugin specs are under `lua/plugins/`; core settings are under
  `lua/config/`; `lazy-lock.json` pins plugin revisions. Inspect the lockfile
  and installed plugin source before changing plugin options or APIs.
- The reported runtime is Neovim 0.12.6; verify `nvim --version` rather than
  assuming that version is installed. Check Neovim-version-specific APIs against
  the installed version's help/source.
- The user's requested LSP-root policy is Git root for all LSPs, falling back
  to the current file's directory outside Git. Check resolved roots for each
  active client: server-specific config may override a global default.
- For LSP/keymap/plugin errors, trace the keymap, plugin spec, server/client
  capability, and locked plugin revision separately. Don't claim `gd` works
  without testing on project files with the LSP running.
- Validate Lua/config changes with headless Neovim when available; report any
  plugin/runtime limitations that prevent an integration test.

## `zsh/` — Zsh

- `.zshrc` loads `zsh/.zsh_modules/*.zsh` from `~/.zsh_modules`.
- Put shell behavior in the appropriate module rather than duplicating it in
  `.zshrc`. Preserve Zsh-specific syntax and test with `zsh -n` when available.
- `git.zsh` contains short Git aliases; `dev.zsh` creates/attaches a tmux
  session with Neovim, OpenCode, and a shell. Preserve its command checks and
  safe handling of existing sessions.

## `tmux/` — tmux

- Main config: `.config/tmux/tmux.conf`; plugins are managed by TPM.
- `tmux/.config/tmux/plugins/` is ignored vendored/plugin runtime content. Do
  not edit upstream plugin files to change local behavior; change `tmux.conf`
  or document why an upstream patch is needed.
- Validate config syntax with `tmux -f <config> -L <temporary-socket> -C` or an
  equivalent isolated tmux check when tmux is available. Avoid altering the
  user's running tmux server during tests.

## `kitty/` — Kitty terminal

- Main config: `kitty/.config/kitty/kitty.conf`.
- Keep Kitty directives and key mappings valid for the target platform. Validate
  with Kitty's config/test facilities if installed; don't assume Kitty is
  available in the current environment.

## `ghostty/` — Ghostty terminal

- Main config: `ghostty/.config/ghostty/config`.
- Preserve Ghostty's `key = value` syntax and check option names against the
  installed Ghostty version or its documentation when changing settings.

## `opencode/` — OpenCode

- Main config: `opencode/.config/opencode/opencode.json`.
- Keep it valid JSON and compatible with the OpenCode config schema/version.
  Preserve the explicit permission policy; ask before broadening permissions
  (especially shell or external-directory access).

## `apps.sh`, `install.sh`, and `docs/`

- `apps.sh` installs packages separately for macOS and Linux; preserve those
  platform branches and don't run it unless installation was requested.
- `install.sh` uses GNU Stow and skips conflicts. Avoid changing its conflict
  handling or running it without explicit permission, since it creates symlinks
  in the user's home directory.
- Put cross-package setup notes in `docs/` and keep the top-level README in sync
  when the repository layout or installation process changes.
