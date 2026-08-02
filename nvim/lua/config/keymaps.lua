-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

vim.keymap.set("n", "<leader>fd", function()
  local path = vim.fn.getreg("+")

  path = vim.trim(path)

  if path == "" then
    vim.notify("Clipboard is empty", vim.log.levels.WARN)
    return
  end

  path = vim.fn.expand(path)

  if vim.fn.filereadable(path) == 0 then
    vim.notify("File not readable: " .. path, vim.log.levels.ERROR)
    return
  end

  local ok, err = pcall(vim.cmd, "vert diffsplit " .. vim.fn.fnameescape(path))
  if not ok then
    vim.notify("Diff failed for " .. path .. ": " .. err, vim.log.levels.ERROR)
    return
  end

  vim.notify("Diffing against " .. path)
end, { desc = "Diff against clipboard path" })
