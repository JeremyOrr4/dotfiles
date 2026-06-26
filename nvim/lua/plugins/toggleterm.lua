return {
  { "akinsho/toggleterm.nvim", enabled = false },

  {
    "folke/snacks.nvim",
    keys = {
      {
        "<C-t>",
        function()
          Snacks.terminal.focus(nil, { cwd = vim.fn.getcwd() })
        end,
        mode = { "n", "t" },
        desc = "Toggle Terminal",
      },
    },
    opts = function(_, opts)
      opts.terminal = vim.tbl_deep_extend("force", opts.terminal or {}, {
        win = {
          position = "bottom",
          height = 0.2,
          enter = true,
        },
      })
    end,
  },
}
