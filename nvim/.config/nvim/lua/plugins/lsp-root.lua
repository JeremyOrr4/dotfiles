local function git_root_or_file_dir(bufnr, on_dir)
  local name = vim.api.nvim_buf_get_name(bufnr)
  local root
  if name ~= "" then
    root = vim.fs.root(name, ".git") or vim.fs.dirname(name)
  else
    root = vim.fn.getcwd()
  end
  on_dir(root)
end

return {
  "neovim/nvim-lspconfig",
  init = function()
    -- Apply the same root policy to every LSP configuration.
    vim.lsp.config("*", {
      root_dir = git_root_or_file_dir,
    })
  end,
}
