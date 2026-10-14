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
  keys = {
    {
      "<leader>e",
      function()
        local name = vim.api.nvim_buf_get_name(0)
        local root = name ~= "" and (vim.fs.root(name, ".git") or vim.fs.dirname(name)) or vim.fn.getcwd()
        Snacks.explorer({ cwd = root })
      end,
      desc = "Explorer (Git root)",
    },
  },
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
