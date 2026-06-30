#!/usr/bin/env sh

DOTFILES="$(cd "$(dirname "$0")" && pwd)"

echo "== Restoring Kitty =="
mkdir -p "$HOME/.config/kitty"
cp "$DOTFILES/kitty/kitty.conf" "$HOME/.config/kitty/"

echo "== Restoring Neovim =="
mkdir -p "$HOME/.config/nvim"
cp -R "$DOTFILES/nvim/"* "$HOME/.config/nvim/"

echo "== Restoring Zsh =="
cp "$DOTFILES/zsh/.zshrc" "$HOME/.zshrc"
cp -R "$DOTFILES/zsh/.zsh_modules" "$HOME/"

echo "== Restoring OpenCode =="
mkdir -p "$HOME/.config/opencode"
cp "$DOTFILES/opencode/opencode.json" "$HOME/.config/opencode/"

echo "Done."
