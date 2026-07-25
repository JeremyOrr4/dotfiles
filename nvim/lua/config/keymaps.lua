-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

vim.keymap.set("n", "<leader>fd", function()
  local path = vim.fn.getreg("+")
  if path == "" then
    vim.notify("Clipboard is empty", vim.log.levels.WARN)
    return
  end
  vim.cmd("vert diffsplit " .. vim.fn.fnameescape(path))
end, { desc = "Diff against clipboard path" })
