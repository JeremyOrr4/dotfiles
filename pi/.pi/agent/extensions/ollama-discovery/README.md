# Pi Ollama model discovery extension

This user-level Pi extension discovers local Ollama models once per Pi process
startup. It is installed at:

```text
~/.pi/agent/extensions/ollama-discovery/
```

The current Caged container mounts the host's `~/.pi` directory at
`/home/caged/.pi`, so this extension is available without changing or rebuilding
Caged. It does not depend on the project directory mounted in the container.

## Files

- `index.ts` — Pi extension entry point. Discovers models during extension
  loading, then registers the in-memory `ollama-discovered` provider.
- `discovery.ts` — URL validation, Ollama HTTP requests, tag parsing, model
  metadata mapping, timeouts, and fail-open warnings.
- `test/discovery.test.ts` — unit and local HTTP integration tests.

## Behavior

1. Read `OLLAMA_BASE_URL`, defaulting to
   `http://host.docker.internal:11434`.
2. At Pi startup, request `GET /api/tags` and preserve each Ollama model name/tag
   as Pi's model ID. Request `POST /api/show` for context and capability
   metadata, with a conservative fallback if details are unavailable.
3. Register provider ID `ollama-discovered` with display name
   **Ollama (local models)**. The provider uses the Ollama OpenAI-compatible
   `/v1` endpoint and Pi's `openai-completions` API adapter. “OpenAI-compatible”
   describes the HTTP protocol; the models and provider are Ollama. The dummy
   API key `ollama` is required by the adapter and ignored by local Ollama.
4. Discover only at startup. There is no polling or request when `/model` opens.
   Restart Pi after pulling or removing models.
5. On an unavailable endpoint, invalid response, or empty model list, Pi keeps
   starting and reports a warning. Existing providers are not replaced.

The extension only registers its provider in memory. It does not write or alter
`settings.json`, `auth.json`, or `models.json`.

## Networking

The container must be able to reach the host Ollama API on TCP port `11434`.
The user manages any persistent host forwarding and firewall rules. Pi does not
listen on a port, and Docker `-p` is not needed for the container's outbound
connection to Ollama.

Ollama may need to bind to an address accessible from Docker (for example,
`OLLAMA_HOST=0.0.0.0:11434` when starting `ollama serve`). Restrict access with
host firewall/forwarding rules. Set `OLLAMA_BASE_URL` in the Pi process
environment to use a different reachable origin. For a Caged launch, the
variable must be forwarded into the container by the existing setup; this
extension does not modify Caged's environment handling.

The override must be an HTTP(S) origin with no path, query, fragment, or URL
credentials. The extension appends the Ollama API paths.

## Tests

With Node.js 24 or newer:

```sh
node --experimental-strip-types --test \
  ~/.pi/agent/extensions/ollama-discovery/test/discovery.test.ts
```

Tests cover URL validation, exact model IDs, metadata, empty/malformed/error/
timeout responses, provider registration, and hashes of existing Pi config files
before and after registration.

When changing the extension, keep discovery startup-only, preserve unrelated Pi
configuration, update this README if behavior changes, and restart Pi to verify
it loads the changed extension.
