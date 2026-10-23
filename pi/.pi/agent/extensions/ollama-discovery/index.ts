import { CONTEXT_SOURCES, discoverOllamaSafely } from "./discovery.ts";

const PROVIDER_ID = "ollama-discovered";
// Pi's default compaction.reserveTokens. Compaction runs once context exceeds the window minus this.
const DEFAULT_RESERVE_TOKENS = 16384;

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

export default async function (pi) {
  const discovery = await discover();
  const warning = register(pi, discovery);

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
      const report = formatReport(refreshed, refreshWarning);
      if (ctx.hasUI) {
        ctx.ui.notify(report, refreshWarning ? "warning" : "info");
      } else {
        console.log(report);
      }
    },
  });
}
