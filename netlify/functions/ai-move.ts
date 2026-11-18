// Netlify function: POST /.netlify/functions/ai-move
// A thin wrapper. All the logic is in ../aiMoveHandler.ts so it can be tested.
import { handleAiMove } from "../aiMoveHandler";
import { createRateLimiter } from "../rateLimiter";
import { createCooldownStore } from "../ai/cooldowns";
import { providersFromEnv } from "../ai/providers";
import ranking from "../ai/model-ranking.json";

// Minimal declaration so we do not need @types/node just for this.
declare const process: { env: Record<string, string | undefined> };

// Best effort only: this memory is per function instance (see ai-opponent.md).
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
const store = createCooldownStore(process.env, fetch);

export default async (request: Request): Promise<Response> => {
  const result = await handleAiMove(
    {
      method: request.method,
      body: await request.text(),
      // Set by Netlify itself, so a visitor cannot choose it.
      clientId: request.headers.get("x-nf-client-connection-ip") ?? "unknown",
    },
    {
      env: {
        OPENROUTER_API_KEY: process.env["OPENROUTER_API_KEY"],
        LLM_MODEL: process.env["LLM_MODEL"],
      },
      fetch,
      limiter,
      chain: {
        env: process.env,
        providers: providersFromEnv(process.env),
        store,
        fetch,
        measurements: ranking.measurements,
        log: (entry) => console.error(JSON.stringify(entry)),
      },
    },
  );

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
