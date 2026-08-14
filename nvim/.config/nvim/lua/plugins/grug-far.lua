return {
  "MagicDuck/grug-far.nvim",
  keys = {
    {
      "<leader>sr",
      function() require("grug-far").open() end,
      desc = "Search and Replace",
    },
    {
      "<leader>sR",
      function() require("grug-far").open({ prefills = { paths = vim.fn.expand("%") } }) end,
      desc = "Search and Replace (current file)",
    },
  },
  opts = {},
}
