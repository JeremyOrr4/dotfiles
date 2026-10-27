import { CONTEXT_SOURCES, discoverOllamaSafely, warmUpOllamaModel } from "./discovery.ts";

const PROVIDER_ID = "ollama-discovered";
// Pi's default compaction.reserveTokens. Compaction runs once context exceeds the window minus this.
const DEFAULT_RESERVE_TOKENS = 16384;
const WARM_UP_STATUS_KEY = "ollama-warm-up";
// Cycling through models quickly only loads the one the user stops on.
export const WARM_UP_DELAY_MS = 300;

function discover() {
  return discoverOllamaSafely({
    baseUrl: process.env.OLLAMA_BASE_URL || undefined,
    contextLength: process.env.OLLAMA_CONTEXT_LENGTH,
  });
}

function register(pi, discovery) {
  try {
    pi.registerProvider(PROVIDER_ID, {
      name: "Ollama (local models)",
      baseUrl: `${discovery.baseUrl}/v1`,
      apiKey: "ollama",
      api: "openai-completions",
      models: discovery.models,
    });
    return discovery.warning;
  } catch (error) {
    return `Could not register discovered Ollama models (${error?.message || "provider configuration error"}).`;
  }
}

export function formatReport(discovery, warning) {
  const lines = [];
  if (discovery.reachable) {
    lines.push(`Ollama at ${discovery.baseUrl}: ${discovery.models.length} chat model(s) as ${PROVIDER_ID}/<model>`);
  }
  const sources = new Map(discovery.details.map((detail) => [detail.id, detail.contextSource]));
  for (const model of discovery.models) {
    const traits = [
      `${model.contextWindow.toLocaleString("en-US")} ctx (${sources.get(model.id)})`,
      model.reasoning && "thinking",
      model.input.includes("image") && "images",
    ].filter(Boolean);
    lines.push(`  ${model.name}: ${traits.join(", ")}`);
  }
  if (discovery.skipped.length > 0) {
    lines.push(`Skipped (no chat support): ${discovery.skipped.join(", ")}`);
  }
  if (discovery.details.some((detail) => detail.contextSource === CONTEXT_SOURCES.trained)) {
    lines.push("The trained length assumes the server runs models at full context; set OLLAMA_CONTEXT_LENGTH to the server's value if it is lower.");
  }
  if (discovery.models.some((model) => model.contextWindow <= 2 * DEFAULT_RESERVE_TOKENS)) {
    lines.push(`Small context windows need a lower compaction.reserveTokens (default ${DEFAULT_RESERVE_TOKENS}); see the extension README.`);
  }
  if (warning) lines.push(warning);
  return lines.join("\n");
}

// Loads a selected Ollama model in the background so the first prompt does not wait for it.
function warmUpOnSelect(pi, getBaseUrl, { delayMs = WARM_UP_DELAY_MS, warmUp = warmUpOllamaModel } = {}) {
  let timer;
  let latest = 0;
  pi.on("model_select", (event, ctx) => {
    clearTimeout(timer);
    const selection = ++latest;
    // The session context can be replaced while a model loads; UI updates are best-effort.
    const ui = (update) => {
      if (selection !== latest || !ctx?.hasUI) return;
      try {
        update(ctx.ui);
      } catch {}
    };
    ui((u) => u.setStatus(WARM_UP_STATUS_KEY, undefined));
    if (event.model?.provider !== PROVIDER_ID) return;

    const model = event.model.id;
    timer = setTimeout(async () => {
      ui((u) => u.setStatus(WARM_UP_STATUS_KEY, `Loading ${model} in Ollama…`));
      try {
        await warmUp({ baseUrl: getBaseUrl(), model });
        ui((u) => u.setStatus(WARM_UP_STATUS_KEY, undefined));
      } catch (error) {
        ui((u) => {
          u.setStatus(WARM_UP_STATUS_KEY, undefined);
          u.notify(`Could not load ${model} in Ollama (${error?.message || "request failed"}).`, "warning");
        });
      }
    }, delayMs);
    timer.unref?.();
  });
}

export default async function (pi, options = {}) {
  const discovery = await discover();
  const warning = register(pi, discovery);
  let baseUrl = discovery.baseUrl;
  warmUpOnSelect(pi, () => baseUrl, options.warmUp);

  if (warning) {
    let notified = false;
    pi.on("session_start", (_event, ctx) => {
      if (notified) return;
      notified = true;
      if (ctx.hasUI) {
        ctx.ui.notify(warning, "warning");
      } else {
        console.warn(`[ollama-discovery] ${warning}`);
      }
    });
  }

  pi.registerCommand("ollama", {
    description: "Re-discover local Ollama models and show what Pi sees",
    handler: async (_args, ctx) => {
      const refreshed = await discover();
      // Keep the current models when Ollama is unreachable, so a transient failure does not empty /model.
      const refreshWarning = refreshed.reachable ? register(pi, refreshed) : refreshed.warning;
      if (refreshed.reachable) baseUrl = refreshed.baseUrl;
      const report = formatReport(refreshed, refreshWarning);
      if (ctx.hasUI) {
        ctx.ui.notify(report, refreshWarning ? "warning" : "info");
      } else {
        console.log(report);
      }
    },
  });
}
