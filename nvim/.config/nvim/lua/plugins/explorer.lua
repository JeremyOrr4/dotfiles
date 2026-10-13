local ignored_exclude = {
  "**/.git/**",
  "**/.venv/**",
  "**/venv/**",
  "**/node_modules/**",
  "**/vendor/**",
  "**/__pycache__/**",
  "**/.pytest_cache/**",
  "**/.mypy_cache/**",
  "**/.ruff_cache/**",
  "**/.tox/**",
  "**/.gradle/**",
  "**/build/**",
  "**/dist/**",
  "**/target/**",
  "**/coverage/**",
  "**/htmlcov/**",
  "**/.nyc_output/**",
  "**/.next/**",
  "**/.turbo/**",
}

return {
  "folke/snacks.nvim",
  opts = {
    picker = {
      sources = {
        files = {
          hidden = true,
          ignored = true,
          exclude = ignored_exclude,
          win = {
            list = {
              keys = {
                ["<M-h>"] = "toggle_hidden",
              },
            },
          },
        },
        explorer = {
          watch = true,
          git_status = true,
          git_status_open = true,
          ignored = true,
          exclude = ignored_exclude,
        },
      },
    },
  },
}
