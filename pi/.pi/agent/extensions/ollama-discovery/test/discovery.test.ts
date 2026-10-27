import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import extension, { formatReport } from "../index.ts";
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_BASE_URLS,
  OLLAMA_COMPAT,
  discoverOllamaModels,
  discoverOllamaSafely,
  normalizeOllamaBaseUrl,
  warmUpOllamaModel,
} from "../discovery.ts";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

// Serves /api/tags and /api/show from `shows` (model name -> /api/show body) and /api/ps from `running`.
function fakeOllama(shows, { running = [] } = {}) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith("/api/version")) return jsonResponse({ version: "0.12.6" });
    if (url.endsWith("/api/tags")) return jsonResponse({ models: Object.keys(shows).map((name) => ({ name })) });
    if (url.endsWith("/api/ps")) return jsonResponse({ models: running });
    if (url.endsWith("/api/show")) return jsonResponse(shows[JSON.parse(options.body).model]);
    throw new Error(`Unexpected URL: ${url}`);
  };
  return { fetchImpl, requests };
}

function withEnv(t, values) {
  for (const [name, value] of Object.entries(values)) {
    const previous = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
}

function fakePi() {
  const pi = { registrations: [], handlers: new Map(), commands: new Map() };
  pi.registerProvider = (id, config) => { pi.registrations.push({ id, config }); };
  pi.on = (event, handler) => pi.handlers.set(event, handler);
  pi.registerCommand = (name, command) => pi.commands.set(name, command);
  return pi;
}

async function listen(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

test("normalizes the default and an overridden Ollama origin", () => {
  assert.equal(normalizeOllamaBaseUrl(), DEFAULT_OLLAMA_BASE_URL);
  assert.equal(normalizeOllamaBaseUrl("http://ollama.internal:11434/"), "http://ollama.internal:11434");
  assert.throws(() => normalizeOllamaBaseUrl("file:///tmp/ollama"), /http or https/);
  assert.throws(() => normalizeOllamaBaseUrl("http://user:secret@ollama:11434"), /without credentials/);
});

test("discovers and maps model tags while using available Ollama metadata", async () => {
  const { fetchImpl, requests } = fakeOllama({
    "qwen3:8b": {
      parameters: "num_ctx 16384\nnum_predict -1",
      model_info: { "general.architecture": "qwen3", "qwen3.context_length": 32768 },
      capabilities: ["completion", "tools"],
    },
    "llava:latest": {
      model_info: { "llama.context_length": 8192 },
      capabilities: ["completion", "vision", "tools"],
    },
  });

  const { models, details } = await discoverOllamaModels({ baseUrl: "http://ollama.test:11434", fetchImpl });
  assert.deepEqual(models.map((model) => model.id), ["qwen3:8b", "llava:latest"]);
  assert.equal(models[0].contextWindow, 16384);
  assert.equal(models[0].maxTokens, 16384);
  assert.deepEqual(models[0].input, ["text"]);
  assert.equal(details[0].contextSource, "Modelfile num_ctx");
  assert.equal(models[1].contextWindow, 8192);
  assert.deepEqual(models[1].input, ["text", "image"]);
  assert.equal(requests[0].url, "http://ollama.test:11434/api/tags");
  assert.ok(requests.filter((request) => request.url.endsWith("/api/show")).every((request) => request.options.method === "POST"));
});

test("configures the OpenAI adapter for Ollama's /v1 endpoint", async () => {
  const { fetchImpl } = fakeOllama({ "coder:latest": { capabilities: ["completion", "tools"] } });
  const { models } = await discoverOllamaModels({ fetchImpl });
  assert.deepEqual(models[0].compat, {
    supportsStore: false,
    supportsDeveloperRole: false,
    maxTokensField: "max_tokens",
  });
  assert.notEqual(models[0].compat, OLLAMA_COMPAT, "each model gets its own compat object");
});

test("resolves context from Modelfile, running model, OLLAMA_CONTEXT_LENGTH, then trained length", async () => {
  const trained = (length) => ({ model_info: { "general.architecture": "llama", "llama.context_length": length } });
  const { fetchImpl } = fakeOllama({
    "modelfile:latest": { ...trained(131072), parameters: "num_ctx 8192" },
    "running:latest": trained(131072),
    "configured:latest": trained(131072),
    "small:latest": trained(4096),
  }, { running: [{ name: "running:latest", context_length: 16384 }] });

  const { models, details } = await discoverOllamaModels({ fetchImpl, contextLength: 32768 });
  const context = Object.fromEntries(models.map((model, index) => [model.id, [model.contextWindow, details[index].contextSource]]));
  assert.deepEqual(context, {
    "modelfile:latest": [8192, "Modelfile num_ctx"],
    "running:latest": [16384, "running model"],
    "configured:latest": [32768, "OLLAMA_CONTEXT_LENGTH"],
    // Ollama caps num_ctx at the trained length.
    "small:latest": [4096, "OLLAMA_CONTEXT_LENGTH"],
  });

  const unconfigured = await discoverOllamaModels({ fetchImpl });
  assert.equal(unconfigured.models[2].contextWindow, 131072);
  assert.equal(unconfigured.details[2].contextSource, "trained length");
});

test("marks thinking models as reasoning and maps pi thinking levels to Ollama values", async () => {
  const { fetchImpl } = fakeOllama({
    "qwen3:8b": { capabilities: ["completion", "tools", "thinking"] },
    "gemma3:4b": { capabilities: ["completion"] },
  });
  const { models } = await discoverOllamaModels({ fetchImpl });
  assert.equal(models[0].reasoning, true);
  assert.deepEqual(models[0].thinkingLevelMap, { off: "none", minimal: null });
  assert.equal(models[1].reasoning, false);
  assert.equal(models[1].thinkingLevelMap, undefined);
});

test("skips embedding-only models and labels models without tool support", async () => {
  const { fetchImpl } = fakeOllama({
    "nomic-embed-text:latest": { capabilities: ["embedding"] },
    "gemma3:4b": { capabilities: ["completion", "vision"] },
    "legacy:latest": {},
  });
  const { models, skipped, details } = await discoverOllamaModels({ fetchImpl });
  assert.deepEqual(skipped, ["nomic-embed-text:latest"]);
  assert.deepEqual(models.map((model) => [model.id, model.name]), [
    ["gemma3:4b", "gemma3:4b (no tool support)"],
    // Servers without capability metadata keep the plain name.
    ["legacy:latest", "legacy:latest"],
  ]);
  assert.deepEqual(details.map((detail) => detail.tools), [false, undefined]);

  const onlyEmbeddings = await discoverOllamaSafely({
    baseUrl: "http://ollama.test:11434",
    fetchImpl: fakeOllama({ "nomic-embed-text:latest": { capabilities: ["embedding"] } }).fetchImpl,
  });
  assert.match(onlyEmbeddings.warning, /no chat models/);
});

test("keeps discovered tags if optional model metadata is unavailable", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "small:latest" }] });
    throw new Error("show endpoint unavailable");
  };
  const { models, details } = await discoverOllamaModels({ fetchImpl });
  assert.equal(models.length, 1);
  assert.equal(models[0].contextWindow, DEFAULT_CONTEXT_WINDOW);
  assert.equal(details[0].contextSource, "fallback");
});

test("falls back to a local Ollama when the Docker host is unreachable and no URL is configured", async () => {
  const { fetchImpl: local } = fakeOllama({ "qwen3:8b": { capabilities: ["completion", "tools"] } });
  const fetchImpl = async (url, options) => {
    if (url.startsWith(DEFAULT_OLLAMA_BASE_URLS[0])) throw new Error("getaddrinfo ENOTFOUND host.docker.internal");
    return local(url, options);
  };
  const discovery = await discoverOllamaSafely({ fetchImpl });
  assert.equal(discovery.baseUrl, "http://127.0.0.1:11434");
  assert.deepEqual(discovery.models.map((model) => model.id), ["qwen3:8b"]);
  assert.equal(discovery.warning, undefined);

  const nowhere = await discoverOllamaSafely({ fetchImpl: async () => { throw new Error("connection refused"); } });
  assert.equal(nowhere.reachable, false);
  assert.match(nowhere.warning, /host\.docker\.internal:11434 or http:\/\/127\.0\.0\.1:11434/);
});

test("ignores an invalid OLLAMA_CONTEXT_LENGTH with a warning", async () => {
  const { fetchImpl } = fakeOllama({ "qwen3:8b": { capabilities: ["completion", "tools"] } });
  const discovery = await discoverOllamaSafely({ baseUrl: "http://ollama.test:11434", fetchImpl, contextLength: "16k" });
  assert.equal(discovery.models.length, 1);
  assert.equal(discovery.models[0].contextWindow, DEFAULT_CONTEXT_WINDOW);
  assert.match(discovery.warning, /OLLAMA_CONTEXT_LENGTH must be a positive integer/);
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
  const baseUrl = await listen(t, (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") {
      response.end(JSON.stringify({ models: [{ name: "test-coder:latest" }] }));
      return;
    }
    if (request.url === "/api/show") {
      request.resume();
      response.end(JSON.stringify({ model_info: { "test.context_length": 8192 }, capabilities: ["completion", "tools"] }));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  });
  withEnv(t, { OLLAMA_BASE_URL: baseUrl, OLLAMA_CONTEXT_LENGTH: undefined });

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

  const pi = fakePi();
  await extension(pi);

  const after = await fingerprintConfigs();

  assert.deepEqual(after, before);
  const [registration] = pi.registrations;
  assert.equal(registration.id, "ollama-discovered");
  assert.equal(registration.config.name, "Ollama (local models)");
  assert.equal(registration.config.baseUrl, `${baseUrl}/v1`);
  assert.equal(registration.config.api, "openai-completions");
  assert.equal(registration.config.apiKey, "ollama");
  assert.equal(registration.config.refreshModels, undefined, "discovery must run only at startup or on /ollama");
  assert.deepEqual(registration.config.models.map((model) => model.id), ["test-coder:latest"]);
  assert.equal(pi.handlers.has("session_start"), false);
  assert.equal(typeof pi.commands.get("ollama")?.handler, "function");
});

test("/ollama re-discovers models and keeps them when Ollama becomes unreachable", async (t) => {
  let names = ["first:latest"];
  let available = true;
  const baseUrl = await listen(t, (request, response) => {
    if (!available) {
      request.socket.destroy();
      return;
    }
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") {
      response.end(JSON.stringify({ models: names.map((name) => ({ name })) }));
      return;
    }
    request.resume();
    response.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
  });
  withEnv(t, { OLLAMA_BASE_URL: baseUrl, OLLAMA_CONTEXT_LENGTH: "8192" });

  const pi = fakePi();
  await extension(pi);
  const notices = [];
  const ctx = { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } };

  names = ["first:latest", "second:latest"];
  await pi.commands.get("ollama").handler("", ctx);
  assert.equal(pi.registrations.length, 2);
  assert.deepEqual(pi.registrations[1].config.models.map((model) => model.id), ["first:latest", "second:latest"]);
  assert.equal(notices[0].level, "info");
  assert.match(notices[0].message, /2 chat model\(s\)/);
  assert.match(notices[0].message, /second:latest: 8,192 ctx \(OLLAMA_CONTEXT_LENGTH\)/);

  available = false;
  await pi.commands.get("ollama").handler("", ctx);
  assert.equal(pi.registrations.length, 2, "an unreachable server does not replace the registered models");
  assert.equal(notices[1].level, "warning");
  assert.match(notices[1].message, /Could not discover Ollama models/);
});

test("report explains context sources and small-context compaction", () => {
  const report = formatReport({
    reachable: true,
    baseUrl: "http://127.0.0.1:11434",
    models: [
      { id: "qwen3:8b", name: "qwen3:8b", contextWindow: 16384, reasoning: true, input: ["text"] },
      { id: "llava:latest", name: "llava:latest (no tool support)", contextWindow: 131072, reasoning: false, input: ["text", "image"] },
    ],
    details: [
      { id: "qwen3:8b", contextSource: "running model" },
      { id: "llava:latest", contextSource: "trained length" },
    ],
    skipped: ["nomic-embed-text:latest"],
  });
  assert.match(report, /qwen3:8b: 16,384 ctx \(running model\), thinking/);
  assert.match(report, /llava:latest \(no tool support\): 131,072 ctx \(trained length\), images/);
  assert.match(report, /Skipped \(no chat support\): nomic-embed-text:latest/);
  assert.match(report, /set OLLAMA_CONTEXT_LENGTH/);
  assert.match(report, /compaction\.reserveTokens/);
});

test("unavailable Ollama does not stop extension registration and reports a warning", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  withEnv(t, { OLLAMA_BASE_URL: `http://127.0.0.1:${port}` });

  const pi = fakePi();
  await extension(pi);

  const [registration] = pi.registrations;
  assert.equal(registration.id, "ollama-discovered");
  assert.deepEqual(registration.config.models, []);
  const onSessionStart = pi.handlers.get("session_start");
  assert.equal(typeof onSessionStart, "function");

  let notice;
  onSessionStart({}, { hasUI: true, ui: { notify: (message, level) => { notice = { message, level }; } } });
  assert.equal(notice.level, "warning");
  assert.match(notice.message, /Could not discover Ollama models/);
});

test("warm-up loads the model with an empty /api/generate request", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return jsonResponse({ model: "qwen3:8b", done: true });
  };
  await warmUpOllamaModel({ baseUrl: "http://ollama.test:11434/", model: "qwen3:8b", fetchImpl });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://ollama.test:11434/api/generate");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), { model: "qwen3:8b" });
});

test("selecting an Ollama model warms up only the last selection", async (t) => {
  const baseUrl = await listen(t, (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") {
      response.end(JSON.stringify({ models: [{ name: "a:latest" }, { name: "b:latest" }] }));
      return;
    }
    request.resume();
    response.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
  });
  withEnv(t, { OLLAMA_BASE_URL: baseUrl, OLLAMA_CONTEXT_LENGTH: "8192" });

  const warmed = [];
  let fail = false;
  const warmUp = async (request) => {
    warmed.push(request);
    if (fail) throw new Error("HTTP 500");
  };
  const pi = fakePi();
  await extension(pi, { warmUp: { delayMs: 0, warmUp } });
  const onModelSelect = pi.handlers.get("model_select");
  assert.equal(typeof onModelSelect, "function");

  const statuses = [];
  const notices = [];
  const ctx = {
    hasUI: true,
    ui: {
      setStatus: (key, text) => statuses.push({ key, text }),
      notify: (message, level) => notices.push({ message, level }),
    },
  };
  const select = (provider, id) => onModelSelect({ type: "model_select", model: { provider, id }, source: "set" }, ctx);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  select("ollama-discovered", "a:latest");
  select("ollama-discovered", "b:latest");
  await settle();
  assert.deepEqual(warmed, [{ baseUrl, model: "b:latest" }]);
  assert.ok(statuses.some((status) => status.text === "Loading b:latest in Ollama…"));
  assert.equal(statuses.at(-1).text, undefined);

  select("anthropic", "claude-opus-5-5");
  await settle();
  assert.equal(warmed.length, 1, "models from other providers are not warmed up");

  fail = true;
  select("ollama-discovered", "a:latest");
  await settle();
  assert.equal(notices.at(-1).level, "warning");
  assert.match(notices.at(-1).message, /Could not load a:latest in Ollama \(HTTP 500\)/);
});
