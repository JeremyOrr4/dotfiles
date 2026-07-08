# pi-docker: Run pi inside a Docker container
# Usage: pi-docker "Refactor this"
function pi-docker() {
  command -v docker &>/dev/null || {
    echo "ERROR: docker not found. Start Docker Desktop or install the Docker CLI." >&2
    return 1
  }

  local PI_CONFIG_DIR="$HOME/.pi/agent"
  local PI_IMAGE="node:20"
  local PI_PKG="@earendil-works/pi-coding-agent"
  local PI_CONTAINER_NAME="pi-$(basename "$(pwd)" | tr -dc '[:alnum:]_-')-$$"

  local api_key_vars=(
    ANTHROPIC_API_KEY
    OPENAI_API_KEY
    DEEPSEEK_API_KEY
    GEMINI_API_KEY
    MISTRAL_API_KEY
    GROQ_API_KEY
    AZURE_OPENAI_API_KEY
    OPENROUTER_API_KEY
    TOGETHER_API_KEY
    HF_API_KEY
    XAI_API_KEY
    CEREBRAS_API_KEY
    FIREWORKS_API_KEY
  )

  local env_flags=()
  for var in "${api_key_vars[@]}"; do
    if [[ -n "${(P)var}" ]]; then
      env_flags+=(--env "$var=${(P)var}")
    fi
  done

  local auth_mount=()
  if [[ ${#env_flags[@]} -eq 0 ]]; then
    auth_mount=(-v "$PI_CONFIG_DIR/auth.json:/home/node/.pi/agent/auth.json:ro")
  fi

  mkdir -p "$PI_CONFIG_DIR"/{sessions,extensions,skills,prompts,themes}

  docker run -it --rm --init \
    --name "$PI_CONTAINER_NAME" \
    -v "$(pwd):/workspace" \
    -w /workspace \
    --user "$(id -u):$(id -g)" \
    -v "$PI_CONFIG_DIR:/home/node/.pi/agent" \
    "${auth_mount[@]}" \
    "${env_flags[@]}" \
    --env HOME=/home/node \
    --env TERM="$TERM" \
    --env PI_SKIP_VERSION_CHECK=1 \
    --ipc=host \
    "$PI_IMAGE" \
    npx --yes "$PI_PKG" "$@"
}
