#!/bin/zsh

DOTFILES="$HOME/Documents/jer-work/code/dotfiles"

echo "== Syncing Kitty =="
mkdir -p "$DOTFILES/kitty"
cp "$HOME/.config/kitty/kitty.conf" "$DOTFILES/kitty/"

echo "== Syncing Neovim =="
mkdir -p "$DOTFILES/nvim"
cp -R "$HOME/.config/nvim/"* "$DOTFILES/nvim/"

echo "== Syncing Zsh =="
mkdir -p "$DOTFILES/zsh"
cp "$HOME/.zshrc" "$DOTFILES/zsh/.zshrc"
cp -R "$HOME/.zsh_modules" "$DOTFILES/zsh/"

echo "Done."
