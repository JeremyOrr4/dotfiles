llm() {
  local model
  model=$(ollama list | tail -n +2 | awk '{print $1}' | fzf --height=40% --reverse --border=rounded --prompt="  Model › " --header="↑↓ arrows  Enter to select  Esc to quit")

  [[ -z "$model" ]] && return

  local thinking
  thinking=$(printf "With thinking\nNo thinking" | fzf --height=20% --reverse --border=rounded --prompt="  Mode › " --header="↑↓ arrows  Enter to select  Esc to quit")

  [[ -z "$thinking" ]] && return

  if [[ "$thinking" == "No thinking" ]]; then
    ollama run "$model" --think=false
  else
    ollama run "$model"
  fi
}
