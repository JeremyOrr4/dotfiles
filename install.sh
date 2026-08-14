#!/bin/zsh
set -e

DOTFILES="$(cd "$(dirname "$0")" && pwd)"

if ! command -v stow >/dev/null 2>&1; then
  echo "Error: GNU Stow is not installed."
  echo "  macOS:         brew install stow"
  echo "  Debian/Ubuntu: sudo apt install stow"
  exit 1
fi

cd "$DOTFILES"

succeeded=()
failed=()

for entry in "$DOTFILES"/.*(N) "$DOTFILES"/*(N); do
  [ -d "$entry" ] || continue
  pkg="${entry:t}"

  case "$pkg" in
    .|..|.*|docs|install.sh|README.md|LICENSE) continue ;;
  esac

  echo
  echo "== Stowing $pkg =="
  if output=$(stow -v -t "$HOME" "$pkg" 2>&1); then
    echo "$output"
    succeeded+=("$pkg")
  else
    echo "$output"
    echo "  !! Conflict detected: $pkg was skipped and no symlinks were created for it."
    echo "$output" | grep -E "existing target" | while read -r line; do
      echo "  CONFLICT: $line"
    done
    echo "  Back up or remove the conflicting file(s), then re-run ./install.sh"
    failed+=("$pkg")
  fi
done

echo
echo "== Summary =="
if (( ${#succeeded} )); then
  echo "Stowed: $succeeded"
fi
if (( ${#failed} )); then
  echo "Skipped due to conflicts: $failed"
fi
