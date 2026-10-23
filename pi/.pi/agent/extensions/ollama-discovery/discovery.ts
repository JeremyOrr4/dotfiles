// Tried in order when OLLAMA_BASE_URL is unset: the Caged/Docker host, then a native local server.
export const DEFAULT_OLLAMA_BASE_URLS = ["http://host.docker.internal:11434", "http://127.0.0.1:11434"];
export const DEFAULT_OLLAMA_BASE_URL = DEFAULT_OLLAMA_BASE_URLS[0];
export const DEFAULT_CONTEXT_WINDOW = 4096;
export const REQUEST_TIMEOUT_MS = 1500;

// Ollama's /v1 endpoint reads `max_tokens` (not `max_completion_tokens`) and has no `store`.
// Chat templates know `system` but not the `developer` role pi uses for OpenAI reasoning models.
export const OLLAMA_COMPAT = {
  supportsStore: false,
  supportsDeveloperRole: false,
  maxTokensField: "max_tokens",
};

// Ollama accepts reasoning_effort "none", "low", "medium", or "high"; pi has no other levels to map.
export const OLLAMA_THINKING_LEVEL_MAP = { off: "none", minimal: null };

export const CONTEXT_SOURCES = {
  modelfile: "Modelfile num_ctx",
  running: "running model",
  configured: "OLLAMA_CONTEXT_LENGTH",
  trained: "trained length",
  fallback: "fallback",
};

export function normalizeOllamaBaseUrl(value = DEFAULT_OLLAMA_BASE_URL) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OLLAMA_BASE_URL must be a valid http(s) URL origin");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("OLLAMA_BASE_URL must use http or https");
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("OLLAMA_BASE_URL must be an origin without credentials, path, query, or fragment");
  }

  return url.origin;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function makeAbortController(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

async function fetchJson(fetchImpl, url, { method = "GET", body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const { controller, timer } = makeAbortController(timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function modelNames(tags) {
  if (!tags || !Array.isArray(tags.models)) {
    throw new Error("Ollama /api/tags returned an unexpected response");
  }
  return [...new Set(tags.models.map((model) => {
    const name = typeof model?.name === "string" ? model.name : model?.model;
    return typeof name === "string" ? name.trim() : "";
  }).filter(Boolean))];
}

// `/api/ps` reports the context each loaded model actually runs with. Older servers omit it.
async function runningContextLengths(fetchImpl, origin, timeoutMs) {
  const contexts = new Map();
  try {
    const ps = await fetchJson(fetchImpl, `${origin}/api/ps`, { timeoutMs });
    for (const model of Array.isArray(ps?.models) ? ps.models : []) {
      const contextLength = positiveInteger(model?.context_length);
      const name = typeof model?.name === "string" ? model.name : model?.model;
      if (contextLength && typeof name === "string") contexts.set(name, contextLength);
    }
  } catch {
    // Running-model context is optional; discovery falls back to configured or trained lengths.
  }
  return contexts;
}

function findContextLength(value) {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, nested] of Object.entries(value)) {
    if (key === "context_length" || key.endsWith(".context_length")) {
      const parsed = positiveInteger(nested);
      if (parsed) return parsed;
    }
  }
  for (const nested of Object.values(value)) {
    const found = findContextLength(nested);
    if (found) return found;
  }
  return undefined;
}

function trainedContextLength(show) {
  const info = show?.model_info;
  const architecture = info?.["general.architecture"];
  return positiveInteger(info?.[`${architecture}.context_length`]) ?? findContextLength(info);
}

function modelfileContextLength(show) {
  const fromParameters = typeof show?.parameters === "string"
    ? show.parameters.match(/^num_ctx\s+(\d+)\s*$/m)?.[1]
    : undefined;
  const fromModelfile = typeof show?.modelfile === "string"
    ? show.modelfile.match(/^PARAMETER\s+num_ctx\s+(\d+)\s*$/m)?.[1]
    : undefined;
  return positiveInteger(fromParameters ?? fromModelfile);
}

// Ollama's /v1 endpoint ignores a request num_ctx, so the server decides the context: a Modelfile
// num_ctx, else OLLAMA_CONTEXT_LENGTH, capped at the trained length. A loaded model reports its own.
function resolveContextWindow(show, runningContext, configuredContext) {
  const trained = trainedContextLength(show);
  const candidates = [
    [modelfileContextLength(show), CONTEXT_SOURCES.modelfile],
    [runningContext, CONTEXT_SOURCES.running],
    [configuredContext, CONTEXT_SOURCES.configured],
  ];
  for (const [value, source] of candidates) {
    if (value) return { contextWindow: trained ? Math.min(value, trained) : value, contextSource: source };
  }
  if (trained) return { contextWindow: trained, contextSource: CONTEXT_SOURCES.trained };
  return { contextWindow: DEFAULT_CONTEXT_WINDOW, contextSource: CONTEXT_SOURCES.fallback };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function discoverOllamaModels({
  baseUrl = DEFAULT_OLLAMA_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  contextLength,
} = {}) {
  const origin = normalizeOllamaBaseUrl(baseUrl);
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable in this Pi runtime");

  const tags = await fetchJson(fetchImpl, `${origin}/api/tags`, { timeoutMs });
  const names = modelNames(tags);
  const running = await runningContextLengths(fetchImpl, origin, timeoutMs);
  const discovered = await mapWithConcurrency(names, 4, async (name) => {
    let show;
    try {
      show = await fetchJson(fetchImpl, `${origin}/api/show`, {
        method: "POST",
        body: { model: name },
        timeoutMs,
      });
    } catch {
      // A tag remains usable even if Ollama cannot return its optional metadata.
    }

    // Older servers omit capabilities; treat those models as capable chat models.
    const capabilities = Array.isArray(show?.capabilities) ? show.capabilities : undefined;
    if (capabilities && !capabilities.includes("completion")) return { skipped: name };

    const { contextWindow, contextSource } = resolveContextWindow(show, running.get(name), contextLength);
    const reasoning = capabilities?.includes("thinking") === true;
    const tools = capabilities ? capabilities.includes("tools") : undefined;
    return {
      model: {
        id: name,
        name: tools === false ? `${name} (no tool support)` : name,
        reasoning,
        ...(reasoning && { thinkingLevelMap: { ...OLLAMA_THINKING_LEVEL_MAP } }),
        input: capabilities?.includes("vision") ? ["text", "image"] : ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow,
        // Pi caps each request's max_tokens to the context left after the prompt.
        maxTokens: contextWindow,
        compat: { ...OLLAMA_COMPAT },
      },
      details: { id: name, contextSource, tools },
    };
  });

  return {
    models: discovered.filter((entry) => entry.model).map((entry) => entry.model),
    details: discovered.filter((entry) => entry.details).map((entry) => entry.details),
    skipped: discovered.filter((entry) => entry.skipped).map((entry) => entry.skipped),
  };
}

// Returns the first candidate origin, in order, that answers `/api/version`.
async function firstReachable(candidates, fetchImpl, timeoutMs) {
  if (candidates.length === 1) return candidates[0];
  const probes = await Promise.allSettled(candidates.map((origin) =>
    fetchJson(fetchImpl, `${origin}/api/version`, { timeoutMs })));
  const index = probes.findIndex((probe) => probe.status === "fulfilled");
  return index === -1 ? undefined : candidates[index];
}

export async function discoverOllamaSafely(options = {}) {
  const { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = options;
  const empty = { models: [], details: [], skipped: [], reachable: false };
  const warnings = [];

  let candidates;
  try {
    candidates = options.baseUrl ? [normalizeOllamaBaseUrl(options.baseUrl)] : DEFAULT_OLLAMA_BASE_URLS;
  } catch (error) {
    return {
      ...empty,
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      warning: `${error.message}. Using no discovered Ollama models.`,
    };
  }

  let contextLength;
  if (options.contextLength !== undefined && options.contextLength !== "") {
    contextLength = positiveInteger(options.contextLength);
    if (!contextLength) warnings.push("OLLAMA_CONTEXT_LENGTH must be a positive integer; ignoring it.");
  }

  const baseUrl = await firstReachable(candidates, fetchImpl, timeoutMs);
  if (!baseUrl) {
    warnings.unshift(`Could not reach Ollama at ${candidates.join(" or ")}. Check that Ollama is running and reachable from this container; set OLLAMA_BASE_URL to override the address.`);
    return { ...empty, baseUrl: candidates[0], warning: warnings.join(" ") };
  }

  try {
    const discovery = await discoverOllamaModels({ fetchImpl, timeoutMs, baseUrl, contextLength });
    if (discovery.models.length === 0) {
      const what = discovery.skipped.length > 0 ? "no chat models" : "no local models";
      warnings.unshift(`Ollama responded at ${baseUrl}, but has ${what}. Pull one with: ollama pull <model>`);
    }
    return { ...discovery, baseUrl, reachable: true, warning: warnings.join(" ") || undefined };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "the request timed out" : error?.message || "the request failed";
    warnings.unshift(`Could not discover Ollama models at ${baseUrl} (${reason}). Check that Ollama is running and reachable from this container; set OLLAMA_BASE_URL to override the address.`);
    return { ...empty, baseUrl, warning: warnings.join(" ") };
  }
}
