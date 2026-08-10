dev() {
    emulate -L zsh
    setopt err_return

    local project_dir="${1:-$PWD}"
    project_dir="${project_dir:A}"   # resolve to absolute path

    if [[ ! -d "$project_dir" ]]; then
        echo "dev: directory does not exist: $project_dir" >&2
        return 1
    fi

    # Make sure the tools we need are actually installed
    local cmd
    for cmd in tmux nvim opencode; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            echo "dev: required command not found: $cmd" >&2
            return 1
        fi
    done

    # Derive a session name from the directory so different projects
    # get different sessions instead of stomping on one shared "dev" session.
    # Replace chars tmux dislikes in session names (. and :) with -
    local session_name="dev-${project_dir:t}"
    session_name="${session_name//[.:]/-}"

    # If the session already exists, just (re)attach/switch to it instead
    # of tearing it down and rebuilding — much faster and keeps state.
    if tmux has-session -t "$session_name" 2>/dev/null; then
        echo "dev: session '$session_name' already exists, attaching..."
        _dev_goto_session "$session_name"
        return 0
    fi

    # Create detached session, capture the actual window id tmux gives us
    # (don't assume index 1 — depends on the user's base-index setting)
    local window_id
    window_id=$(tmux new-session \
        -d \
        -s "$session_name" \
        -c "$project_dir" \
        -P -F '#{window_id}' \
        "nvim")

    # Split right for opencode
    tmux split-window \
        -h \
        -t "$window_id" \
        -c "$project_dir" \
        "opencode"

    # Split bottom-right for a plain terminal
    tmux split-window \
        -v \
        -t "$window_id" \
        -c "$project_dir"

    # Arrange as: big pane on the left, two stacked panes on the right
    tmux select-layout -t "$window_id" main-vertical

    # Put focus back on nvim before attaching
    tmux select-pane -t "${window_id}.1"

    _dev_goto_session "$session_name"
}

# Attach if we're outside tmux, switch-client if we're already inside one
# (tmux attach-session from inside another session just errors out)
_dev_goto_session() {
    local session_name="$1"
    if [[ -n "$TMUX" ]]; then
        tmux switch-client -t "$session_name"
    else
        tmux attach-session -t "$session_name"
    fi
}

