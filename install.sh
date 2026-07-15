#!/bin/zsh
set -e

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

backup_and_link_dir() {
  local src="$1"
  local dest="$2"

  if [ -L "$dest" ]; then
    echo "  Removing old symlink: $dest"
    rm "$dest"
  elif [ -d "$dest" ]; then
    echo "  Backing up $dest -> ${dest}.bak.${TIMESTAMP}"
    mv "$dest" "${dest}.bak.${TIMESTAMP}"
  elif [ -f "$dest" ]; then
    echo "  Backing up $dest -> ${dest}.bak.${TIMESTAMP}"
    mv "$dest" "${dest}.bak.${TIMESTAMP}"
  fi

  echo "  Linking $src -> $dest"
  ln -s "$src" "$dest"
}

backup_and_link_file() {
  local src="$1"
  local dest="$2"
  local dest_dir
  dest_dir="$(dirname "$dest")"

  mkdir -p "$dest_dir"

  if [ -L "$dest" ]; then
    echo "  Removing old symlink: $dest"
    rm "$dest"
  elif [ -f "$dest" ]; then
    echo "  Backing up $dest -> ${dest}.bak.${TIMESTAMP}"
    mv "$dest" "${dest}.bak.${TIMESTAMP}"
  fi

  echo "  Linking $src -> $dest"
  ln -s "$src" "$dest"
}

echo "== Installing configs via symlinks =="
echo

echo "== Kitty =="
backup_and_link_dir "$DOTFILES/kitty" "$HOME/.config/kitty"

echo
echo "== Neovim =="
backup_and_link_dir "$DOTFILES/nvim" "$HOME/.config/nvim"

echo
echo "== Zsh =="
backup_and_link_file "$DOTFILES/zsh/.zshrc" "$HOME/.zshrc"
backup_and_link_dir "$DOTFILES/zsh/.zsh_modules" "$HOME/.zsh_modules"

echo
echo "== OpenCode =="
backup_and_link_file "$DOTFILES/opencode/opencode.json" "$HOME/.config/opencode/opencode.json"

echo
echo "== Tmux =="
backup_and_link_dir "$DOTFILES/tmux" "$HOME/.config/tmux"

echo "
== Ghostty =="
backup_and_link_dir "$DOTFILES/ghostty" "$HOME/.config/ghostty"

echo
echo "Done."
