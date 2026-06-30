-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

vim.opt.relativenumber = true      -- relative line numbers (great for jumping)
vim.opt.scrolloff = 8              -- keep 8 lines above/below cursor
vim.opt.wrap = true               -- no line wrapping
vim.opt.clipboard = "unnamedplus"  -- use system clipboard
vim.opt.timeoutlen = 300           -- faster key sequence detection
vim.o.autoread = true

-- Auto-reload files changed externally (e.g. by OpenCode)
vim.o.autoread = true
vim.api.nvim_create_autocmd({ "FocusGained", "BufEnter", "CursorHold", "CursorHoldI" }, {
  command = "checktime",
})
