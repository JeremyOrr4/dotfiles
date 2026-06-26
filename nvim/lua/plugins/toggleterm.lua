return {
  "akinsho/toggleterm.nvim",
  version = "*",
  config = function()
    require("toggleterm").setup({
      size = 100,
      open_mapping = [[<C-t>]],
      direction = "horizontal",
      close_on_exit = true,
      shell = vim.o.shell,
    })

    local Terminal = require("toggleterm.terminal").Terminal
    local opencode = Terminal:new({
      cmd = "opencode",
      direction = "vertical",
      size = 10,
      close_on_exit = true,
    })

    vim.keymap.set("n", "<leader>oc", function()
      opencode:toggle()
    end, { desc = "Toggle OpenCode" })
  end,
}
