# Pi Ollama model discovery extension

This user-level Pi extension discovers local Ollama models when Pi starts and
on demand with `/ollama`. It is installed at:

```text
~/.pi/agent/extensions/ollama-discovery/
```

The current Caged container mounts the host's `~/.pi` directory at
`/home/caged/.pi`, so this extension is available without changing or rebuilding
Caged. It does not depend on the project directory mounted in the container.

## Files

- `index.ts` — Pi extension entry point. Discovers models during extension
  loading, registers the in-memory `ollama-discovered` provider, and adds the
  `/ollama` command.
- `discovery.ts` — URL validation, Ollama HTTP requests, tag parsing, model
  metadata mapping, timeouts, and fail-open warnings.
- `test/discovery.test.ts` — unit and local HTTP integration tests.

## Behavior

1. Read `OLLAMA_BASE_URL`. When it is unset, try
   `http://host.docker.internal:11434` (Caged/Docker host) and then
   `http://127.0.0.1:11434` (native Ollama), using the first that answers.
2. At Pi startup, request `GET /api/tags` and preserve each Ollama model name/tag
   as Pi's model ID. Request `POST /api/show` for context and capability
   metadata, and `GET /api/ps` for the context of loaded models, with a
   conservative fallback if details are unavailable.
3. Register provider ID `ollama-discovered` with display name
   **Ollama (local models)**. The provider uses the Ollama OpenAI-compatible
   `/v1` endpoint and Pi's `openai-completions` API adapter. “OpenAI-compatible”
   describes the HTTP protocol; the models and provider are Ollama. The dummy
   API key `ollama` is required by the adapter and ignored by local Ollama.
4. Discover at startup and when you run `/ollama`. There is no polling or
   request when `/model` opens. Run `/ollama` after pulling or removing models;
   it re-registers the provider and reports each model's context window and its
   source. If Ollama is unreachable, `/ollama` keeps the current models.
5. On an unavailable endpoint, invalid response, or empty model list, Pi keeps
   starting and reports a warning. Existing providers are not replaced.

The extension only registers its provider in memory. It does not write or alter
`settings.json`, `auth.json`, or `models.json`.

### Model metadata

- **Capabilities:** models whose `/api/show` capabilities lack `completion`
  (embedding models) are skipped. Models without `tools` are listed as
  `<model> (no tool support)` because Ollama rejects Pi's tool definitions for
  them. Models with `vision` accept images. Servers that report no capabilities
  keep every model.
- **Thinking:** models with the `thinking` capability are reasoning models.
  Pi's thinking levels are sent as `reasoning_effort`: `off` → `none`, `low`,
  `medium`, and `high`; `minimal` is unavailable and clamps to `low`.
- **Request format:** the provider sends `max_tokens`, no `store` field, and the
  system prompt with the `system` role. Pi's defaults for an unknown
  OpenAI-compatible URL would send `max_completion_tokens` and, for reasoning
  models, the `developer` role, which Ollama's chat templates do not expect.
- **Output limit:** `maxTokens` equals the context window. Pi caps each request
  to the context left after the prompt.

### Context window

Ollama's `/v1` endpoint ignores a per-request `num_ctx`, so the server decides
each model's context. The extension reports the first available value, capped at
the model's trained length:

1. `num_ctx` from the model's Modelfile parameters.
2. The context of the loaded model from `/api/ps`.
3. `OLLAMA_CONTEXT_LENGTH` in the Pi process environment.
4. The model's trained context length.
5. 4096 tokens when Ollama returns no metadata.

Set `OLLAMA_CONTEXT_LENGTH` for Pi to the same value the Ollama server uses.
Otherwise an unloaded model reports its trained length, which may exceed the
server's context; Ollama then truncates the prompt without an error.

Pi compacts once the context exceeds the window minus
`compaction.reserveTokens` (default 16384), and keeps
`compaction.keepRecentTokens` (default 20000). With the defaults, a 16K window
compacts on every turn and a 32K window compacts repeatedly. Prefer at least a
32K server context and lower both values for local models in
`~/.pi/agent/settings.json`, keyed by exact `provider/model`:

```json
{
  "compaction": {
    "modelOverrides": {
      "ollama-discovered/qwen3:8b": { "reserveTokens": 8192, "keepRecentTokens": 10000 }
    }
  }
}
```

## Networking

The container must be able to reach the host Ollama API on TCP port `11434`.
The user manages any persistent host forwarding and firewall rules. Pi does not
listen on a port, and Docker `-p` is not needed for the container's outbound
connection to Ollama.

Ollama may need to bind to an address accessible from Docker (for example,
`OLLAMA_HOST=0.0.0.0:11434` when starting `ollama serve`). Restrict access with
host firewall/forwarding rules. Set `OLLAMA_BASE_URL` in the Pi process
environment to use a different reachable origin. For a Caged launch,
`OLLAMA_BASE_URL` and `OLLAMA_CONTEXT_LENGTH` must be forwarded into the
container by the existing setup; this extension does not modify Caged's
environment handling.

The override must be an HTTP(S) origin with no path, query, fragment, or URL
credentials. The extension appends the Ollama API paths.

## Tests

With Node.js 24 or newer:

```sh
node --experimental-strip-types --test \
  ~/.pi/agent/extensions/ollama-discovery/test/discovery.test.ts
```

Tests cover URL validation and the default-URL fallback, exact model IDs,
capability filtering, thinking levels, request compatibility settings, context
resolution, empty/malformed/error/timeout responses, provider registration, the
`/ollama` refresh, and hashes of existing Pi config files before and after
registration.

When changing the extension, keep discovery limited to startup and `/ollama`,
preserve unrelated Pi configuration, update this README if behavior changes, and
restart Pi or run `/reload` to verify it loads the changed extension.
