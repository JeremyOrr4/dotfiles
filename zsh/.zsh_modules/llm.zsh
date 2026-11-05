# ==========================================
# Ollama Configuration
# ==========================================

# Default context length
export OLLAMA_CONTEXT_LENGTH="${OLLAMA_CONTEXT_LENGTH:-16384}"

# Start Ollama with an optional context argument
ollama-start() {
    local context="${1:-16k}"

    case "$context" in
        8k|8K)   context=8192 ;;
        16k|16K) context=16384 ;;
        24k|24K) context=24576 ;;
        32k|32K) context=32768 ;;
        64k|64K) context=65536 ;;
        *)
            echo "Usage: ollama-start [8k|16k|24k|32k|64k]"
            return 1
            ;;
    esac

    if ! command -v brew >/dev/null 2>&1 || ! command -v launchctl >/dev/null 2>&1; then
        echo "ollama-start: brew and launchctl are required." >&2
        return 1
    fi

    export OLLAMA_CONTEXT_LENGTH="$context"

    echo "Starting Ollama..."
    echo "Context length: ${context} tokens"

    launchctl setenv OLLAMA_CONTEXT_LENGTH "$context" || return 1
    brew services restart ollama || return 1

    echo "Ollama started successfully."
}
