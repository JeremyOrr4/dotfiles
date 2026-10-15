import { discoverOllamaSafely, DEFAULT_OLLAMA_BASE_URL } from "./discovery.ts";

const PROVIDER_ID = "ollama-discovered";

export default async function (pi) {
  const discovery = await discoverOllamaSafely({
    baseUrl: process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
  });
  let warning = discovery.warning;

  try {
    pi.registerProvider(PROVIDER_ID, {
      name: "Ollama (local models)",
      baseUrl: `${discovery.baseUrl}/v1`,
      apiKey: "ollama",
      api: "openai-completions",
      models: discovery.models,
    });
  } catch (error) {
    warning = `Could not register discovered Ollama models (${error?.message || "provider configuration error"}).`;
  }

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
}
