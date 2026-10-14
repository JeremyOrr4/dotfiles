return {
  "neovim/nvim-lspconfig",
  opts = {
    servers = {
      basedpyright = {
        root_dir = function(bufnr, on_dir)
          local name = vim.api.nvim_buf_get_name(bufnr)
          on_dir(vim.fs.root(name, ".git") or vim.fs.dirname(name))
        end,
      },
    },
  },
}
