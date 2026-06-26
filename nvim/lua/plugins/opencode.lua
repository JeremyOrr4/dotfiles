local opencode_cmd = "opencode --port"

---@type snacks.terminal.Opts
local opencode_terminal_opts = {
  win = {
    position = "right",
    enter = false,
    width = 0.20, 
  },
}

return {
  {
    "nickjvandyke/opencode.nvim",
    version = "*",
    dependencies = {
      { "folke/snacks.nvim", optional = true },
    },
    config = function()
      ---@type opencode.Opts
      vim.g.opencode_opts = {
        server = {
          start = function()
            require("snacks.terminal").open(opencode_cmd, opencode_terminal_opts)
          end,
        },
      }

      vim.o.autoread = true

      vim.keymap.set({ "n", "x" }, "<leader>oa", function()
        require("opencode").ask("@this: ")
      end, { desc = "Ask OpenCode" })

      vim.keymap.set({ "n", "x" }, "<leader>os", function()
        require("opencode").select()
      end, { desc = "Select OpenCode action" })

      vim.keymap.set({ "n", "t" }, "<leader>ot", function()
        require("snacks.terminal").toggle(opencode_cmd, opencode_terminal_opts)
      end, { desc = "Toggle OpenCode" })

      vim.keymap.set({ "n", "x" }, "go", function()
        return require("opencode").operator("@this ")
      end, { desc = "Append range to OpenCode", expr = true })

      vim.keymap.set("n", "goo", function()
        return require("opencode").operator("@this ") .. "_"
      end, { desc = "Append line to OpenCode", expr = true })

      vim.keymap.set("n", "<S-C-u>", function()
        require("opencode").command("session.half.page.up")
      end, { desc = "Scroll OpenCode up" })

      vim.keymap.set("n", "<S-C-d>", function()
        require("opencode").command("session.half.page.down")
      end, { desc = "Scroll OpenCode down" })
    end,
  },

  -- snacks.nvim: enhanced ask() input and select() picker
  {
    "folke/snacks.nvim",
    opts = function(_, opts)
      opts.input = vim.tbl_deep_extend("force", opts.input or {}, { enabled = true })
      opts.picker = vim.tbl_deep_extend("force", opts.picker or {}, {
        actions = {
          opencode_send = function(picker) ---@param picker snacks.Picker
            local items = vim.tbl_map(function(item) ---@param item snacks.picker.Item
              return item.file
                  and require("opencode").format({ path = item.file, from = item.pos, to = item.end_pos })
                or item.text
            end, picker:selected({ fallback = true }))

            require("opencode").prompt(table.concat(items, ", ") .. " ")
          end,
        },
        win = {
          input = {
            keys = {
              ["<a-a>"] = { "opencode_send", mode = { "n", "i" } },
            },
          },
        },
      })
    end,
  },

  -- blink.cmp: completions in the OpenCode ask() prompt
  {
    "saghen/blink.cmp",
    opts_extend = { "sources.per_filetype" },
    opts = function(_, opts)
      opts.sources = opts.sources or {}
      opts.sources.per_filetype = vim.tbl_extend("force", opts.sources.per_filetype or {}, {
        opencode_ask = { "lsp", "buffer" },
      })
      opts.sources.providers = vim.tbl_deep_extend("force", opts.sources.providers or {}, {
        lsp = { fallbacks = {} },
      })
    end,
  },

  -- lualine: show connected OpenCode server status
  {
    "nvim-lualine/lualine.nvim",
    optional = true,
    opts = function(_, opts)
      table.insert(opts.sections.lualine_z, 1, {
        function()
          local ok, opencode = pcall(require, "opencode")
          return ok and opencode.statusline() or ""
        end,
      })
    end,
  },
}
