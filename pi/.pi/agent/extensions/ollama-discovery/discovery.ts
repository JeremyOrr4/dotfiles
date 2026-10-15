export const DEFAULT_OLLAMA_BASE_URL = "http://host.docker.internal:11434";
export const DEFAULT_CONTEXT_WINDOW = 4096;
export const DEFAULT_MAX_TOKENS = 2048;
export const REQUEST_TIMEOUT_MS = 1500;

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

function findContextLength(value) {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, nested] of Object.entries(value)) {
    if (key === "context_length" || key.endsWith(".context_length")) {
      const parsed = Number(nested);
      if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    }
  }
  for (const nested of Object.values(value)) {
    const found = findContextLength(nested);
    if (found) return found;
  }
  return undefined;
}

function configuredContextLength(show) {
  const fromParameters = typeof show?.parameters === "string"
    ? show.parameters.match(/^num_ctx\s+(\d+)\s*$/m)?.[1]
    : undefined;
  const fromModelfile = typeof show?.modelfile === "string"
    ? show.modelfile.match(/^PARAMETER\s+num_ctx\s+(\d+)\s*$/m)?.[1]
    : undefined;
  const configured = Number(fromParameters ?? fromModelfile);
  if (Number.isSafeInteger(configured) && configured > 0) return configured;
  return findContextLength(show?.model_info) ?? DEFAULT_CONTEXT_WINDOW;
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
} = {}) {
  const origin = normalizeOllamaBaseUrl(baseUrl);
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable in this Pi runtime");

  const tags = await fetchJson(fetchImpl, `${origin}/api/tags`, { timeoutMs });
  const names = modelNames(tags);
  return mapWithConcurrency(names, 4, async (name) => {
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

    const contextWindow = configuredContextLength(show);
    const capabilities = Array.isArray(show?.capabilities) ? show.capabilities : [];
    return {
      id: name,
      name,
      reasoning: false,
      input: capabilities.includes("vision") ? ["text", "image"] : ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow,
      maxTokens: Math.min(DEFAULT_MAX_TOKENS, contextWindow),
    };
  });
}

export async function discoverOllamaSafely(options = {}) {
  const rawBaseUrl = options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  let baseUrl;
  try {
    baseUrl = normalizeOllamaBaseUrl(rawBaseUrl);
  } catch (error) {
    return {
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      models: [],
      warning: `${error.message}. Using no discovered Ollama models.`,
    };
  }

  try {
    const models = await discoverOllamaModels({ ...options, baseUrl });
    if (models.length === 0) {
      return {
        baseUrl,
        models,
        warning: `Ollama responded at ${baseUrl}, but has no local models. Pull one with: ollama pull <model>`,
      };
    }
    return { baseUrl, models };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "the request timed out" : error?.message || "the request failed";
    return {
      baseUrl,
      models: [],
      warning: `Could not discover Ollama models at ${baseUrl} (${reason}). Check that Ollama is running and reachable from this container; set OLLAMA_BASE_URL to override the address.`,
    };
  }
}
