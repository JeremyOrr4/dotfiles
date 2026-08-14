-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

-- External file change detection (e.g., AI agents editing files)
vim.api.nvim_create_autocmd({ "FocusGained", "TermClose", "TermLeave" }, {
  group = vim.api.nvim_create_augroup("checktime", { clear = true }),
  callback = function()
    if vim.bo.buftype ~= "nofile" then
      vim.cmd("checktime")
    end
  end,
})

-- Auto-reload when a file is changed externally (by AI agents, git, etc.)
-- Instead of prompting "file changed, reload?", just silently reload it.
vim.api.nvim_create_autocmd("FileChangedShell", {
  group = vim.api.nvim_create_augroup("auto_reload", { clear = true }),
  callback = function()
    -- If buffer has unsaved changes, don't overwrite them — skip reload
    if vim.bo.modified then
      return
    end
    -- Schedule the reload to avoid issues during the event itself
    vim.schedule(function()
      if vim.bo.buftype ~= "nofile" and vim.v.fcs_reason == "changed" then
        vim.cmd("edit!")
      end
    end)
  end,
})

