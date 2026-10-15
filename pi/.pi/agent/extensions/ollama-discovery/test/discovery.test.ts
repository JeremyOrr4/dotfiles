import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import extension from "../index.ts";
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_OLLAMA_BASE_URL,
  discoverOllamaModels,
  discoverOllamaSafely,
  normalizeOllamaBaseUrl,
} from "../discovery.ts";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("normalizes the default and an overridden Ollama origin", () => {
  assert.equal(normalizeOllamaBaseUrl(), DEFAULT_OLLAMA_BASE_URL);
  assert.equal(normalizeOllamaBaseUrl("http://ollama.internal:11434/"), "http://ollama.internal:11434");
  assert.throws(() => normalizeOllamaBaseUrl("file:///tmp/ollama"), /http or https/);
  assert.throws(() => normalizeOllamaBaseUrl("http://user:secret@ollama:11434"), /without credentials/);
});

test("discovers and maps model tags while using available Ollama metadata", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith("/api/tags")) {
      return jsonResponse({ models: [
        { name: "qwen3:8b" },
        { model: "llava:latest" },
        { name: "qwen3:8b" },
      ] });
    }
    if (url.endsWith("/api/show")) {
      const request = JSON.parse(options.body);
      if (request.model === "qwen3:8b") {
        return jsonResponse({
          parameters: "num_ctx 16384\nnum_predict -1",
          model_info: { "qwen3.context_length": 32768 },
          capabilities: ["completion", "tools"],
        });
      }
      return jsonResponse({
        model_info: { "llama.context_length": 8192 },
        capabilities: ["completion", "vision"],
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const models = await discoverOllamaModels({ baseUrl: "http://ollama.test:11434", fetchImpl });
  assert.deepEqual(models.map((model) => model.id), ["qwen3:8b", "llava:latest"]);
  assert.equal(models[0].contextWindow, 16384);
  assert.equal(models[0].maxTokens, 2048);
  assert.deepEqual(models[0].input, ["text"]);
  assert.equal(models[1].contextWindow, 8192);
  assert.deepEqual(models[1].input, ["text", "image"]);
  assert.equal(requests[0].url, "http://ollama.test:11434/api/tags");
  assert.ok(requests.slice(1).every((request) => request.options.method === "POST"));
});

test("keeps discovered tags if optional model metadata is unavailable", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "small:latest" }] });
    throw new Error("show endpoint unavailable");
  };
  const models = await discoverOllamaModels({ fetchImpl });
  assert.equal(models.length, 1);
  assert.equal(models[0].contextWindow, DEFAULT_CONTEXT_WINDOW);
});

test("empty, malformed, and unreachable Ollama responses fail open with a warning", async () => {
  const empty = await discoverOllamaSafely({
    baseUrl: "http://ollama.test:11434",
    fetchImpl: async () => jsonResponse({ models: [] }),
  });
  assert.deepEqual(empty.models, []);
  assert.match(empty.warning, /no local models/);

  const malformed = await discoverOllamaSafely({
    baseUrl: "http://ollama.test:11434",
    fetchImpl: async () => jsonResponse({ unexpected: true }),
  });
  assert.deepEqual(malformed.models, []);
  assert.match(malformed.warning, /unexpected response/);

  const unreachable = await discoverOllamaSafely({
    baseUrl: "http://ollama.test:11434",
    fetchImpl: async () => { throw new Error("connection refused"); },
  });
  assert.deepEqual(unreachable.models, []);
  assert.match(unreachable.warning, /reachable from this container/);
  assert.match(unreachable.warning, /OLLAMA_BASE_URL/);

  const httpError = await discoverOllamaSafely({
    baseUrl: "http://ollama.test:11434",
    fetchImpl: async () => jsonResponse({}, 503),
  });
  assert.match(httpError.warning, /HTTP 503/);

  const timedOut = await discoverOllamaSafely({
    baseUrl: "http://ollama.test:11434",
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });
  assert.match(timedOut.warning, /request timed out/);
});

test("registers an isolated Ollama provider without modifying Pi config", async (t) => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") {
      response.end(JSON.stringify({ models: [{ name: "test-coder:latest" }] }));
      return;
    }
    if (request.url === "/api/show") {
      request.resume();
      response.end(JSON.stringify({ model_info: { "test.context_length": 8192 }, capabilities: ["completion"] }));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const previousBaseUrl = process.env.OLLAMA_BASE_URL;
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    if (previousBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previousBaseUrl;
  });

  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  const configPaths = ["settings.json", "auth.json", "models.json"].map((name) => join(agentDir, name));
  const fingerprintConfigs = async () => Promise.all(configPaths.map(async (path) => {
    try {
      const [info, contents] = await Promise.all([stat(path), readFile(path)]);
      const digest = createHash("sha256").update(contents).digest("hex");
      return [path, info.size, digest];
    } catch (error) {
      if (error.code === "ENOENT") return [path, null, null];
      throw error;
    }
  }));
  const before = await fingerprintConfigs();

  let registration;
  const handlers = new Map();
  await extension({
    registerProvider: (id, config) => { registration = { id, config }; },
    on: (event, handler) => handlers.set(event, handler),
  });

  const after = await fingerprintConfigs();

  assert.deepEqual(after, before);
  assert.equal(registration.id, "ollama-discovered");
  assert.equal(registration.config.name, "Ollama (local models)");
  assert.equal(registration.config.baseUrl, `${process.env.OLLAMA_BASE_URL}/v1`);
  assert.equal(registration.config.api, "openai-completions");
  assert.equal(registration.config.apiKey, "ollama");
  assert.equal(registration.config.refreshModels, undefined, "discovery must run only at startup");
  assert.deepEqual(registration.config.models.map((model) => model.id), ["test-coder:latest"]);
  assert.equal(handlers.has("session_start"), false);
});

test("unavailable Ollama does not stop extension registration and reports a warning", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));

  const previousBaseUrl = process.env.OLLAMA_BASE_URL;
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`;
  t.after(() => {
    if (previousBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previousBaseUrl;
  });

  let registration;
  let onSessionStart;
  await extension({
    registerProvider: (id, config) => { registration = { id, config }; },
    on: (event, handler) => { if (event === "session_start") onSessionStart = handler; },
  });

  assert.equal(registration.id, "ollama-discovered");
  assert.deepEqual(registration.config.models, []);
  assert.equal(typeof onSessionStart, "function");

  let notice;
  onSessionStart({}, { hasUI: true, ui: { notify: (message, level) => { notice = { message, level }; } } });
  assert.equal(notice.level, "warning");
  assert.match(notice.message, /Could not discover Ollama models/);
});
