-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

vim.keymap.set("n", "<leader>fd", function()
  local path = vim.fn.getreg("+")

  path = vim.trim(path)

  if path == "" then
    vim.notify("Clipboard is empty", vim.log.levels.WARN)
    return
  end

  path = vim.fn.expand(path)

  if vim.fn.filereadable(path) == 0 then
    vim.notify("File not readable: " .. path, vim.log.levels.ERROR)
    return
  end

  local ok, err = pcall(vim.cmd, "vert diffsplit " .. vim.fn.fnameescape(path))
  if not ok then
    vim.notify("Diff failed for " .. path .. ": " .. err, vim.log.levels.ERROR)
    return
  end

  vim.notify("Diffing against " .. path)
end, { desc = "Diff against clipboard path" })

vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(args)
    -- LazyVim owns the standard definition/reference/symbol mappings. Add
    -- call hierarchy using the actual LSP requests when the server supports it.
    local client_id = args.data.client_id
    local client = vim.lsp.get_client_by_id(client_id)
    if not client or not client:supports_method("textDocument/prepareCallHierarchy", args.buf) then
      return
    end

    local function call_hierarchy(direction)
      local method = direction == "incoming" and "callHierarchy/incomingCalls" or "callHierarchy/outgoingCalls"
      if not client:supports_method(method, args.buf) then
        vim.notify("LSP server does not support " .. direction .. " call hierarchy", vim.log.levels.INFO)
        return
      end

      local position_params = vim.lsp.util.make_position_params(0, client.offset_encoding)
      client:request("textDocument/prepareCallHierarchy", position_params, function(err, items)
        if err then
          vim.notify(err.message or "Call hierarchy request failed", vim.log.levels.WARN)
          return
        end
        if not items or vim.tbl_isempty(items) then
          vim.notify("No call hierarchy item at cursor", vim.log.levels.INFO)
          return
        end

        client:request(method, { item = items[1] }, function(call_err, calls)
          if call_err then
            vim.notify(call_err.message or "Call hierarchy request failed", vim.log.levels.WARN)
            return
          end
          if not calls or vim.tbl_isempty(calls) then
            vim.notify("No " .. direction .. " calls found", vim.log.levels.INFO)
            return
          end
          local item = calls[1].from or calls[1].to
          if item then
            vim.lsp.util.show_document(item, client.offset_encoding, { focus = true })
          end
        end, args.buf)
      end, args.buf)
    end

    vim.keymap.set("n", "gi", function()
      call_hierarchy("incoming")
    end, { buffer = args.buf, silent = true, desc = "LSP incoming calls" })
    vim.keymap.set("n", "go", function()
      call_hierarchy("outgoing")
    end, { buffer = args.buf, silent = true, desc = "LSP outgoing calls" })
  end,
})
