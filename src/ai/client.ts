// The browser side of the model call: talks to our own serverless function,
// never to the model provider, and never sees the API key.
import type { CallModel } from "./chooseMove";
import { isServiceErrorCode, ModelServiceError } from "./serviceError";
import { EngineFallbackError } from "./request";

export const ENDPOINT = "/.netlify/functions/ai-move";

// The provider chain stops at 10 seconds; allow its result to arrive before the
// controller's total turn deadline at 12 seconds.
export const CLIENT_TIMEOUT_MS = 11_000;

interface ClientOptions {
  chain?: boolean;
  endpoint?: string;
  timeoutMs?: number;
  fetch?: typeof fetch; // tests pass a fake
}

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

// Builds a callModel for chooseMove. The retry note is sent as its own field
// and the function adds it to the prompt it forwards, so both stay under their
// own size limits. Anything other than a 200 with text is an error, which
// chooseMove counts as a failed attempt and retries.
export function createCallModel(options: ClientOptions = {}): CallModel {
  const endpoint = options.endpoint ?? ENDPOINT;
  const timeoutMs = options.timeoutMs ?? CLIENT_TIMEOUT_MS;

  const call: CallModel = async (prompt, retryNote, signal, context) => {
    const send = options.fetch ?? fetch;

    let response: Response;
    try {
      response = await send(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options.chain && context ? { context } : retryNote ? { prompt, retryNote } : { prompt }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw new Error(
        isTimeout(error) ? "The AI request timed out." : "Could not reach the AI service.",
      );
    }

    if (response.status !== 200) {
      // Trust only known categories, never arbitrary error text from the server.
      const data: unknown = await response.json().catch(() => null);
      const failure = data as { code?: unknown; retryable?: unknown; retryAfterSeconds?: unknown } | null;
      if (isServiceErrorCode(failure?.code)) {
        const seconds = failure.retryAfterSeconds;
        const delay = typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? Math.min(2_147_483_647, seconds * 1000) : 0;
        throw new ModelServiceError(failure.code, failure.retryable === true, delay);
      }
      // Older deployed functions have no categories. Permanent HTTP failures
      // still stop the retry loop; unknown gateway failures may be retried.
      if ([400, 401, 402, 403, 405, 429, 500].includes(response.status)) {
        const code = response.status === 429 ? "rateLimit" : response.status === 402 ? "credits" : response.status === 500 ? "configuration" : "access";
        throw new ModelServiceError(code, false);
      }
      throw new Error(`The AI service answered with status ${response.status}.`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error("The AI service sent an unreadable answer.");
    }

    if (options.chain && (data as { fallback?: unknown } | null)?.fallback === true) throw new EngineFallbackError();
    const text = (data as { text?: unknown } | null)?.text;
    if (typeof text !== "string" || text.trim() === "") {
      throw new Error("The AI service sent an empty answer.");
    }
    return text;
  };
  return options.chain ? Object.assign(call, { handlesChain: true as const }) : call;
}

// The real thing, used by the app.
export const callModel: CallModel = createCallModel({ chain: true });
