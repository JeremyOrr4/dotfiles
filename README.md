# dotfiles

Personal dotfiles managed with GNU Stow. Works on macOS and Linux.

## Install

1. Install Stow:

   ```sh
   # macOS
   brew install stow

   # Debian/Ubuntu
   sudo apt install stow
   ```

2. Clone this repo:

   ```sh
   git clone https://github.com/JeremyOrr4/dotfiles.git
   ```

3. Run the installer from inside the repo:

   ```sh
   cd dotfiles
   ./install.sh
   ```

To also install the required apps (tmux, nvim, zsh, starship):

```sh
./apps.sh
```

The installer stows every package automatically. You can also manage packages
individually:

```sh
stow zsh        # stow a single package
stow -D zsh     # unstow a single package
```

## What's included

- `apps.sh` — installs required apps (tmux, nvim, zsh, starship):
  Homebrew on macOS, apt on Linux (starship via the official curl installer
  since it has no apt package)
- `ghostty` — Ghostty terminal config
- `kitty` — Kitty terminal config
- `nvim` — Neovim config (LazyVim-based, plugins under `lua/plugins`)
- `opencode` — opencode CLI config
- `tmux` — tmux config plus vendored plugins under `plugins/`
- `zsh` — `.zshrc` and modular shell scripts under `.zsh_modules`

## Uninstalling

Remove one package's symlinks:

```sh
stow -D <package>
```

Or remove everything: run `stow -D` for each package, or delete the symlinks
manually.
