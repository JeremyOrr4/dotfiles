# Fix: Ctrl+h/j/k/l pane navigation breaks in LazyVim popups

## Root cause

`vim-navigator.lua` currently does this:

```lua
keys = {
  { "<C-h>", "<cmd>TmuxNavigateLeft<CR>" },
  ...
}
```

Two problems:

1. **No mode specified** — lazy.nvim's `keys` spec defaults to Normal mode
   only. Terminal buffers (toggleterm, lazygit, etc.) never get the mapping.
2. **Global mappings lose to buffer-local ones.** Lazy's UI, Mason, `noice`'s
   cmdline, LSP hover floats, `which-key`, and Telescope/Snacks pickers all
   set their **own local keymaps** on their floating buffer, or mark it
   `nomodifiable`/special. A buffer-local mapping always wins over a global
   one, so your `<C-h>` never reaches `TmuxNavigateLeft` — it either does
   nothing or gets swallowed by the popup.

The fix has two parts: (1) properly configure the plugin with explicit
modes, and (2) force-reapply the navigation keymaps on every buffer/window,
including floats, so they can't be shadowed.

---

## Step 1 — Replace `vim-navigator.lua`

Overwrite the file with this version. Key changes: load eagerly (not
lazy-loaded on keypress), disable navigation when the tmux pane is zoomed
(so you don't accidentally leave a zoomed pane), and bind in both Normal
and Terminal mode.

```lua
return {
  {
    "christoomey/vim-tmux-navigator",
    event = "VeryLazy", -- load immediately, don't wait for a keypress
    init = function()
      vim.g.tmux_navigator_no_mappings = 1
      vim.g.tmux_navigator_disable_when_zoomed = 1
    end,
    keys = {
      { "<C-h>", "<cmd>TmuxNavigateLeft<CR>",  mode = { "n", "t" }, desc = "Tmux/Nvim navigate left" },
      { "<C-j>", "<cmd>TmuxNavigateDown<CR>",  mode = { "n", "t" }, desc = "Tmux/Nvim navigate down" },
      { "<C-k>", "<cmd>TmuxNavigateUp<CR>",    mode = { "n", "t" }, desc = "Tmux/Nvim navigate up" },
      { "<C-l>", "<cmd>TmuxNavigateRight<CR>", mode = { "n", "t" }, desc = "Tmux/Nvim navigate right" },
    },
  },
}
```

---

## Step 2 — Force the mapping to win in every buffer, including floats

Append this to `autocmds.lua`. This re-applies the four mappings as
**buffer-local** maps every time you enter a buffer or window, after any
plugin (Lazy, Mason, noice, which-key, Snacks) has finished setting up its
own local keymaps for that buffer. Buffer-local + applied-last wins.

```lua
-- Force Ctrl-hjkl tmux navigation to work in every window, including
-- floating popups (Lazy, Mason, noice, which-key, Telescope/Snacks, help,
-- quickfix, LSP hover, etc.) that would otherwise shadow the global mapping.
vim.api.nvim_create_autocmd({ "BufEnter", "WinEnter", "FileType" }, {
  group = vim.api.nvim_create_augroup("force_tmux_navigator", { clear = true }),
  callback = function(ev)
    -- defer so this runs *after* the popup's own FileType/BufEnter setup
    vim.schedule(function()
      if not vim.api.nvim_buf_is_valid(ev.buf) then
        return
      end
      local dirs = { h = "Left", j = "Down", k = "Up", l = "Right" }
      for key, dir in pairs(dirs) do
        vim.keymap.set("n", "<C-" .. key .. ">", "<cmd>TmuxNavigate" .. dir .. "<CR>", {
          buffer = ev.buf,
          nowait = true,
          silent = true,
        })
      end
    end)
  end,
})
```

Using `WinEnter` (not just `FileType`) matters because some popups (e.g.
`noice`'s cmdline, `dressing.nvim` inputs) don't always fire a distinct
`FileType` event but always fire `WinEnter`.

---

## Step 3 — Confirm the tmux side doesn't need changes

Your `tmux.conf` loads `christoomey/vim-tmux-navigator` via TPM
(`~/.tmux/plugins/tpm/tpm`). That plugin automatically installs the
`bind -n C-h/j/k/l` passthrough bindings with the `is_vim` process check —
you don't need to add those yourself, and your existing
`bind h select-pane -L` (prefixed) entries are unrelated/harmless.

Just verify the plugin actually installed:

```
tmux
# inside tmux:
<prefix> I    # (capital I) to install/update TPM plugins if you haven't
```

---

## Step 4 — Restart and test each popup type

Restart Neovim (`:qa` then reopen, or `:Lazy sync` first if Step 1 changed
the spec) and test `<C-h/j/k/l>` while each of these is open/focused:

- [ ] `:Lazy` — plugin manager UI
- [ ] `:Mason` — LSP/tool installer UI
- [ ] `which-key` popup (hold `<leader>` and wait)
- [ ] `noice` cmdline (type `:` if you use noice's cmdline UI)
- [ ] LSP hover (`K` on a symbol)
- [ ] Telescope or Snacks picker (`<leader>ff` or similar)
- [ ] A terminal buffer (`:terminal` or toggleterm)
- [ ] `:checkhealth`

In each case, `<C-h/j/k/l>` should now move focus to the adjacent
tmux/Neovim pane instead of doing nothing or getting stuck in the popup.

---

## Step 5 — If one specific popup still misbehaves

Some plugins intentionally trap all keys inside their float (e.g. a picker
in insert-mode prompt state). If a specific one still won't cooperate:

1. Run `:verbose imap <C-h>` (or `nmap`) while that popup is focused — the
   output tells you exactly which script/line last set that mapping, so you
   know what's competing with you.
2. Run `:TmuxNavigatorProcessList` to confirm the plugin sees tmux/vim
   correctly at all.
3. As a last resort for a specific filetype, add it explicitly:

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = "the_offending_filetype",
  callback = function(ev)
    vim.keymap.set("n", "<C-h>", "<cmd>TmuxNavigateLeft<CR>", { buffer = ev.buf })
    -- ...repeat for j/k/l
  end,
})
```

But with the Step 2 autocmd in place, this generic fallback is rarely
needed — it already covers all filetypes/buftypes generically.
