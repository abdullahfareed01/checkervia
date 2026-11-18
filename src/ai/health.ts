// Asks our serverless function whether the AI can be used, without calling
// the model (a GET to the same endpoint; see netlify/aiMoveHandler.ts).
import { ENDPOINT } from "./client";

// ready: the function can serve engine play (or a verified legacy provider).
// offline: an older proxy reported its provider unavailable.
// unreachable: no function answered (for example `npm run dev`
// without netlify dev, or no network).
export type AiStatus = "ready" | "offline" | "unreachable";

// Short: the splash waits for this, and a healthy function answers at once.
export const HEALTH_TIMEOUT_MS = 4_000;

interface HealthOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetch?: typeof fetch; // tests pass a fake
}

/**
 * Checks the AI function. Never throws: any problem is reported as
 * "unreachable", so the game always starts.
 */
export async function checkAiHealth(options: HealthOptions = {}): Promise<AiStatus> {
  const send = options.fetch ?? fetch;
  try {
    const response = await send(options.endpoint ?? ENDPOINT, {
      method: "GET",
      signal: AbortSignal.timeout(options.timeoutMs ?? HEALTH_TIMEOUT_MS),
    });
    if (response.status !== 200) return "unreachable";
    const data: unknown = await response.json();
    const ready = (data as { ready?: unknown } | null)?.ready;
    if (ready === true) return "ready";
    return ready === false ? "offline" : "unreachable";
  } catch {
    // Network error, timeout, or not JSON (the dev server answers with HTML).
    return "unreachable";
  }
}
