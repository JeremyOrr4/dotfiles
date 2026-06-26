dev() {
    if [[ -n "$1" ]]; then
        cd "$1" || return
    fi

    kitty @ goto-layout fat

    kitty @ launch --location=hsplit --cwd=current opencode .
    kitty @ launch --location=hsplit --cwd=current --env PATH="$PATH" zsh -i

    # Make the top (Neovim) window larger.
    kitty @ resize-window --axis=vertical --increment=-8

    exec nvim .
}
