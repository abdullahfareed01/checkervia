// The browser side of the model call: talks to our own serverless function,
// never to the model provider, and never sees the API key.
import type { CallModel } from "./chooseMove";

export const ENDPOINT = "/.netlify/functions/ai-move";

// Netlify stops a function after 60 s. Wait a little longer than that, so the
// function's own error arrives first; this only catches a hung connection.
export const CLIENT_TIMEOUT_MS = 65_000;

interface ClientOptions {
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

  return async (prompt, retryNote) => {
    const send = options.fetch ?? fetch;

    let response: Response;
    try {
      response = await send(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryNote ? { prompt, retryNote } : { prompt }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Error(
        isTimeout(error) ? "The AI request timed out." : "Could not reach the AI service.",
      );
    }

    if (response.status !== 200) {
      throw new Error(`The AI service answered with status ${response.status}.`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error("The AI service sent an unreadable answer.");
    }

    const text = (data as { text?: unknown } | null)?.text;
    if (typeof text !== "string" || text.trim() === "") {
      throw new Error("The AI service sent an empty answer.");
    }
    return text;
  };
}

// The real thing, used by the app.
export const callModel: CallModel = createCallModel();
