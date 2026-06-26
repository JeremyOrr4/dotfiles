# Modular Zsh Configuration
# Dynamically source all .zsh files directly in the ~/.zsh_modules directory

ZSH_MODULES_DIR="$HOME/.zsh_modules"

if [[ -d "$ZSH_MODULES_DIR" ]]; then
  # The (N) prevents errors if no files are found
  for config_file in "$ZSH_MODULES_DIR"/*.zsh(N); do
    source "$config_file"
  done
fi
