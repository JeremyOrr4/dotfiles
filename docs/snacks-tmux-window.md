# Snacks Explorer → Open in New Tmux Window

## What this does

Adds a keymap (`tn`) to the [Snacks](https://github.com/folke/snacks.nvim)
file explorer picker. Pressing it opens a **new tmux window** running `nvim`
in the directory under the cursor, then closes the explorer.

## Prerequisites

- Neovim with [lazy.nvim](https://github.com/folke/lazy.nvim) (or any plugin
  manager that merges `opts` tables — LazyVim does this by default).
- [`folke/snacks.nvim`](https://github.com/folke/snacks.nvim) already
  installed, with its `picker` module enabled (this is on by default in
  LazyVim).
- `tmux` installed and on `$PATH`.
- Neovim must be launched from *inside* a tmux session for the action to work.

## Installation

Create (or edit) `nvim/lua/plugins/explorer.lua` with the following:

```lua
-- nvim/lua/plugins/explorer.lua
-- Adds a keymap ("tn") in the Snacks explorer picker that opens a new
-- tmux window running nvim in the directory of the item under the cursor.
return {
  "folke/snacks.nvim",
  opts = {
    picker = {
      hidden = true,
      ignored = true,
      actions = {
        tmux_nvim = function(picker)
          if not vim.env.TMUX or vim.env.TMUX == "" then
            vim.notify("tmux_nvim: not inside a tmux session", vim.log.levels.WARN)
            return
          end

          local dir = picker:cwd() or vim.fn.getcwd()
          local item = picker:current_item()

          if item and item.file then
            local path = vim.fn.fnamemodify(item.file, ":p")
            dir = (vim.fn.isdirectory(path) == 1) and path or vim.fn.fnamemodify(path, ":h")
          end

          local job_id = vim.fn.jobstart({ "tmux", "new-window", "-c", dir, "nvim" }, {
            on_exit = function(_, code)
              if code ~= 0 then
                vim.notify("tmux_nvim: tmux exited with code " .. code, vim.log.levels.ERROR)
              end
            end,
          })

          if job_id <= 0 then
            vim.notify(
              "tmux_nvim: failed to start tmux (is it installed and on $PATH?)",
              vim.log.levels.ERROR
            )
            return
          end

          picker:close()
        end,
      },
      sources = {
        explorer = {
          hidden = true,
          ignored = true,
          win = {
            list = {
              keys = {
                ["tn"] = { "tmux_nvim", desc = "Open nvim in new tmux window" },
              },
            },
          },
        },
      },
    },
  },
}
```

Restart Neovim (or `:Lazy reload snacks.nvim`) to pick up the change.

## Usage

| Keys | Where          | Action                                                      |
| ---- | -------------- | ------------------------------------------------------------ |
| `tn` | Explorer list  | Open `nvim` in a new tmux window (directory under cursor)   |

`t` and `n` are not used by the explorer's default keymaps, and Snacks
supports multi-character sequences (like `gg`, `zz`), so `tn` is
conflict-free out of the box.

### Target directory rules

| Cursor is on      | New nvim opens in     |
| ------------------ | ---------------------- |
| Directory entry    | That directory          |
| File entry         | Parent of that file     |
| Nothing / no item  | Explorer's current dir  |

## How it works (implementation notes)

1. **Guard**: if `$TMUX` is unset or empty, nvim is not running inside tmux —
   warn and abort. `tmux new-window` requires an active tmux server/session.
2. **Resolve target directory** from the item under the cursor:
   - item is a directory → use it directly
   - item is a file → use its parent directory (`:h`)
   - no item under cursor → fall back to `picker:cwd()`, then `vim.fn.getcwd()`
3. **Spawn the window** as a detached, non-blocking job:
   `tmux new-window -c <dir> nvim`, via `vim.fn.jobstart` with an argument
   list (not a shell string), so paths containing spaces or special
   characters are handled safely.
4. **Verify the job actually started** — `jobstart` returns a non-positive
   value (`0` or `-1`) if it failed to launch (e.g. `tmux` missing from
   `$PATH`). Only close the picker if the job started successfully; report
   an error otherwise.
5. **`on_exit` callback** reports an error if the spawned `tmux` process
   itself later exits non-zero (e.g. tmux server died mid-command).

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `tn` does nothing | Make sure the explorer's **list** window is focused, not the input/prompt line, and that you're in the explorer picker (not another Snacks picker). |
| "not inside a tmux session" | Launch nvim from within tmux: `tmux new -A` then `nvim`, or attach to an existing session first. |
| "failed to start tmux (is it installed and on $PATH?)" | Install tmux, or check `which tmux` resolves inside the same shell nvim was launched from. |
| "tmux exited with code N" | Check `tmux ls` — the tmux server may be unhealthy or the session may have been killed. |
| Window opens in the wrong directory | Target dir comes from the item under the cursor — see the rules table above. If cursor was on nothing, it falls back to the explorer's cwd. |

## Customization

- **Change the trigger key**: edit the `["tn"]` key in the `keys` table.
  Avoid the explorer's existing default keys: `l`, `h`, `a`, `d`, `r`, `c`,
  `m`, `o`, `P`, `y`, `p`, `u`, `.`, `I`, `H`, `Z`.
- **Change directory-resolution logic**: edit the `dir`/`item` block inside
  `tmux_nvim`. E.g., to always use the explorer root instead of the item
  under cursor, delete the `item`-based branch and keep only
  `picker:cwd()`.
- **Change the command run in the new window**: replace `"nvim"` in the
  `jobstart` argument list (e.g. `{ "tmux", "new-window", "-c", dir, "nvim", "." }`
  or a different shell command entirely).


  Found it — the fix is simple. In current Snacks, action functions get called with signature (picker, item) — the item is passed in directly as the second argument, not fetched via a picker:current_item() method (which doesn't exist; that's the "nil value" you're hitting).

The fix

Change:

lua
tmux_nvim = function(picker)
  ...
  local item = picker:current_item()
  ...

to:

lua
tmux_nvim = function(picker, item)
  ...
  -- use `item` directly, no method call needed

Here's the corrected file in full:

Resolved to deliver corrected code swiftly
Resolved to deliver corrected code swiftly
lua
-- nvim/lua/plugins/explorer.lua
-- Adds a keymap ("tn") in the Snacks explorer picker that opens a new
-- tmux window running nvim in the directory of the item under the cursor.
return {
  "folke/snacks.nvim",
  opts = {
    picker = {
      hidden = true,
      ignored = true,
      actions = {
        ---@param picker snacks.Picker
        ---@param item snacks.picker.Item
        tmux_nvim = function(picker, item)
          if not vim.env.TMUX or vim.env.TMUX == "" then
            vim.notify("tmux_nvim: not inside a tmux session", vim.log.levels.WARN)
            return
          end

          local dir = picker:cwd() or vim.fn.getcwd()

          if item and item.file then
            local path = vim.fn.fnamemodify(item.file, ":p")
            dir = (vim.fn.isdirectory(path) == 1) and path or vim.fn.fnamemodify(path, ":h")
          end

          local job_id = vim.fn.jobstart({ "tmux", "new-window", "-c", dir, "nvim" }, {
            on_exit = function(_, code)
              if code ~= 0 then
                vim.notify("tmux_nvim: tmux exited with code " .. code, vim.log.levels.ERROR)
              end
            end,
          })

          if job_id <= 0 then
            vim.notify(
              "tmux_nvim: failed to start tmux (is it installed and on $PATH?)",
              vim.log.levels.ERROR
            )
            return
          end

          picker:close()
        end,
      },
      sources = {
        explorer = {
          hidden = true,
          ignored = true,
          win = {
            list = {
              keys = {
                ["tn"] = { "tmux_nvim", desc = "Open nvim in new tmux window" },
              },
            },
          },
        },
      },
    },
  },
}

What changed and why:

picker:current_item() doesn't exist in the current Snacks API. Actions bound in win.list.keys are invoked as action(picker, item) — the resolved item under the cursor is handed to you directly as the second parameter.
Everything else (guard clause, dir resolution, job-start check) stays the same, since that logic was fine — just the item-lookup line was wrong.

One caveat: item can be nil if the cursor isn't on a valid row (e.g. empty list), which is why the if item and item.file then check matters — it falls back to picker:cwd() in that case.

Want me to save this as an updated version of the doc I made earlier, or is the inline snippet enough for now?


Here's the corrected version:

lua
-- nvim/lua/plugins/explorer.lua
-- Adds a keymap ("tn") in the Snacks explorer picker that opens a new
-- tmux window running nvim in the directory of the item under the cursor.
return {
  "folke/snacks.nvim",
  opts = {
    picker = {
      hidden = true,
      ignored = true,
      actions = {
        ---@param picker snacks.Picker
        ---@param item snacks.picker.explorer.Item
        tmux_nvim = function(picker, item)
          if not vim.env.TMUX or vim.env.TMUX == "" then
            vim.notify("tmux_nvim: not inside a tmux session", vim.log.levels.WARN)
            return
          end

          local dir = picker:cwd() or vim.fn.getcwd()

          if item and item.file then
            local file = item.file
            -- item.file may be relative to the picker's cwd, not nvim's
            -- process cwd, so resolve it explicitly instead of using ":p"
            if not vim.startswith(file, "/") then
              file = dir .. "/" .. file
            end

            local is_dir = item.type == "directory" or item.dir or vim.fn.isdirectory(file) == 1
            dir = is_dir and file or vim.fn.fnamemodify(file, ":h")
          end

          local job_id = vim.fn.jobstart({ "tmux", "new-window", "-c", dir, "nvim" }, {
            on_exit = function(_, code)
              if code ~= 0 then
                vim.notify("tmux_nvim: tmux exited with code " .. code, vim.log.levels.ERROR)
              end
            end,
          })

          if job_id <= 0 then
            vim.notify(
              "tmux_nvim: failed to start tmux (is it installed and on $PATH?)",
              vim.log.levels.ERROR
            )
            return
          end

          picker:close()
        end,
      },
      sources = {
        explorer = {
          hidden = true,
          ignored = true,
          win = {
            list = {
              keys = {
                ["tn"] = { "tmux_nvim", desc = "Open nvim in new tmux window" },
              },
            },
          },
        },
      },
    },
  },
}

Quick way to confirm the fix works: put your cursor on docs, then before pressing tn, run :lua print(vim.inspect(Snacks.picker.get({source="explorer"})[1]:current_item() or "no item")) — actually simpler, just try tn on docs now; it should open exactly in docs, not root.

If it still misbehaves, the most useful debug step is temporarily adding vim.notify(vim.inspect(item)) as the first line inside tmux_nvim so you can see the real shape of item.file/item.type on your version of Snacks — field names have shifted between Snacks releases before.
