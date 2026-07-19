return {
  "okuuva/auto-save.nvim",
  event = { "InsertEnter", "TextChanged" },
  opts = {
    -- Trigger events that cause auto-save
    trigger_events = {
      immediate_save = { "BufLeave", "FocusLost" },      -- save immediately on buffer leave / focus lost
      defer_save = { "InsertLeave", "TextChanged" },     -- save after debounce on these events
    },

    -- Debounce delay in milliseconds
    debounce_delay = 1000,

    -- Condition to check: only save if the buffer is a normal file
    condition = function(bufnr)
      local bufname = vim.api.nvim_buf_get_name(bufnr)
      -- Don't auto-save for special/non-file buffers, oil, fugitive, etc.
      if vim.bo[bufnr].buftype ~= "" then
        return false
      end
      if bufname == "" then
        return false
      end
      -- Skip Neo-tree, alpha dashboard, etc.
      local ft = vim.bo[bufnr].filetype
      if ft == "neo-tree" or ft == "alpha" or ft == "dashboard" or ft == "lazy" then
        return false
      end
      return true
    end,

    -- Don't auto-write for these filetypes
    enabled = true,
    execution_message = {
      enabled = false,  -- set to true if you want a message when auto-saving
    },
  },
}
