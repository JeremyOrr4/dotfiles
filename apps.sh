#!/bin/zsh
set -e

OS="$(uname -s)"
installed=()

case "$OS" in
  Darwin)
    if ! command -v brew >/dev/null 2>&1; then
      echo "Error: Homebrew is not installed."
      echo "  Install it first: https://brew.sh"
      exit 1
    fi
    echo "== Installing apps via Homebrew =="
    brew install tmux neovim zsh starship
    installed=(tmux neovim zsh starship)
    ;;
  Linux)
    echo "== Installing apps via apt =="
    sudo apt-get update
    sudo apt-get install -y tmux neovim zsh
    installed=(tmux neovim zsh)

    if ! command -v starship >/dev/null 2>&1; then
      echo "== Installing starship (no apt package) =="
      curl -sS https://starship.rs/install.sh | sh -s -- -y
      installed+=(starship)
    fi
    ;;
  *)
    echo "Error: unsupported OS: $OS"
    exit 1
    ;;
esac

echo
echo "== Apps installed: ${installed[*]} =="