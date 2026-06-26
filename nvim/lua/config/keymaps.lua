-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

-- Delete whole line in terminal mode
vim.keymap.set("t", "<C-u>", "<C-u>", { desc = "Delete line in terminal" })

-- Delete word back in terminal mode
vim.keymap.set("t", "<C-w>", "<C-w>", { desc = "Delete word in terminal" })
