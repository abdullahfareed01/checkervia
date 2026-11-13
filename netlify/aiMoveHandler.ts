// Request handling for the AI proxy, kept free of Netlify types so tests can
// call it with a fake fetch. The Netlify function (functions/ai-move.ts) is a
// thin wrapper around handleAiMove.
//
// Rules this file keeps:
// - The browser only ever gets { text } or a short generic { error }.
// - The API key and raw provider errors are never returned. The key is never
//   logged (and is blanked out of anything that is).
import type { RateLimiter } from "./rateLimiter";

export const PROVIDER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Limits on what the browser may send.
// Room for the look-ahead scores of the higher AI levels (prompt v3).
export const MAX_PROMPT_CHARS = 8000;
export const MAX_RETRY_NOTE_CHARS = 500;
const MAX_BODY_CHARS = 20_000; // room for JSON escaping of the two fields

// The model is a reasoning model: its thinking tokens count against
// max_tokens, so leave room for thinking plus a tiny {"move": n} answer.
export const MAX_OUTPUT_TOKENS = 1500;

// Netlify stops a synchronous function after 60 s and that cannot be changed
// (docs.netlify.com, "Configuration for functions"). We give up on the
// provider 5 s earlier, so we can still answer with a clean error.
export const PROVIDER_TIMEOUT_MS = 55_000;

// Provider statuses that can mean "no provider supports response_format".
const UNSUPPORTED_PARAMETER_STATUSES = new Set([400, 404, 422]);

const MOVE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "checkers_move",
    strict: true,
    schema: {
      type: "object",
      properties: { move: { type: "integer" }, reason: { type: "string" }, reaction: { type: "string" } },
      required: ["move", "reason", "reaction"],
      additionalProperties: false,
    },
  },
};

export interface HandlerRequest {
  method: string;
  body: string;
  clientId: string;
}

export interface HandlerEnv {
  OPENROUTER_API_KEY?: string | undefined;
  LLM_MODEL?: string | undefined;
}

export interface HandlerDeps {
  env: HandlerEnv;
  fetch: typeof fetch;
  limiter: RateLimiter;
  log?: (message: string) => void;
  providerTimeoutMs?: number;
}

export interface HandlerResponse {
  status: number;
  body: { text: string } | { error: string } | { ready: boolean };
}

function fail(status: number, error: string): HandlerResponse {
  return { status, body: { error } };
}

// Validates the browser's JSON body: only `prompt` (required, non-empty,
// capped) and `retryNote` (optional, capped). Anything else is rejected.
function parseRequestBody(raw: string): { prompt: string; retryNote: string | undefined } | null {
  if (raw.length > MAX_BODY_CHARS) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;

  const record = data as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "prompt" && key !== "retryNote")) return null;

  const { prompt, retryNote } = record;
  if (typeof prompt !== "string" || prompt.trim() === "" || prompt.length > MAX_PROMPT_CHARS) {
    return null;
  }
  if (retryNote !== undefined) {
    if (typeof retryNote !== "string" || retryNote.length > MAX_RETRY_NOTE_CHARS) return null;
  }
  return { prompt, retryNote };
}

// The body sent to OpenRouter. `withSchema` adds the structured-output request.
// require_parameters makes OpenRouter route only to providers that support
// every parameter we send, instead of silently ignoring some.
function providerBody(model: string, content: string, withSchema: boolean) {
  const body = {
    model,
    messages: [{ role: "user", content }],
    max_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: "low" },
    provider: { require_parameters: true },
  };
  return withSchema ? { ...body, response_format: MOVE_SCHEMA } : body;
}

// The model's answer text from an OpenRouter response, or null if there is
// no usable message (for example reasoning used up all the tokens).
function messageContent(data: unknown): string | null {
  const choices = (data as { choices?: unknown } | null)?.choices;
  if (!Array.isArray(choices)) return null;
  const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
  return typeof content === "string" && content.trim() !== "" ? content : null;
}

function finishReason(data: unknown): string {
  const choices = (data as { choices?: unknown } | null)?.choices;
  const reason = Array.isArray(choices) ? (choices[0] as { finish_reason?: unknown })?.finish_reason : null;
  return typeof reason === "string" ? reason : "unknown";
}

// Turns the provider's response into our response. Provider details go to the
// log only (key removed), never to the browser.
async function readProviderResponse(
  response: Response,
  key: string,
  log: (message: string) => void,
): Promise<HandlerResponse> {
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200).split(key).join("[removed]");
    log(`ai-move: provider returned status ${response.status}: ${detail}`);
    return fail(502, "The AI service is unavailable.");
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    log("ai-move: provider sent a body that is not JSON");
    return fail(502, "The AI service is unavailable.");
  }

  const text = messageContent(data);
  if (text === null) {
    log(`ai-move: provider reply had no usable content (finish_reason: ${finishReason(data)})`);
    return fail(502, "The AI service returned no usable answer.");
  }
  return { status: 200, body: { text } };
}

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

// GET is the health check used by the splash screen. It only says whether the
// key and model are set: no provider call, no cost, nothing secret returned,
// and it does not count against the rate limit.
function healthCheck(env: HandlerEnv): HandlerResponse {
  return { status: 200, body: { ready: Boolean(env.OPENROUTER_API_KEY && env.LLM_MODEL) } };
}

// Handles one request. Order: health check (GET), method, rate limit, body
// shape, configuration, then the provider call.
export async function handleAiMove(
  request: HandlerRequest,
  deps: HandlerDeps,
): Promise<HandlerResponse> {
  const log = deps.log ?? (() => {});

  if (request.method === "GET") return healthCheck(deps.env);
  if (request.method !== "POST") return fail(405, "Method not allowed.");
  if (!deps.limiter.allow(request.clientId)) {
    return fail(429, "Too many requests. Please wait a moment.");
  }

  const parsed = parseRequestBody(request.body);
  if (!parsed) return fail(400, "Invalid request.");

  const key = deps.env.OPENROUTER_API_KEY;
  const model = deps.env.LLM_MODEL;
  if (!key || !model) {
    log("ai-move: OPENROUTER_API_KEY or LLM_MODEL is not set");
    return fail(500, "The AI service is not configured.");
  }

  const content = parsed.retryNote ? `${parsed.prompt}\n\n${parsed.retryNote}` : parsed.prompt;
  // One deadline for everything below, including the optional second call.
  const signal = AbortSignal.timeout(deps.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS);

  const send = (withSchema: boolean) =>
    deps.fetch(PROVIDER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(providerBody(model, content, withSchema)),
      signal,
    });

  try {
    let response = await send(true);
    if (UNSUPPORTED_PARAMETER_STATUSES.has(response.status)) {
      // No provider (or this one) accepts response_format. Ask once more
      // without it. parseReply in the app is the final guard either way.
      log(`ai-move: structured output refused (status ${response.status}); retrying without it`);
      response = await send(false);
    }
    return await readProviderResponse(response, key, log);
  } catch (error) {
    if (isTimeout(error)) {
      log("ai-move: provider call timed out");
      return fail(504, "The AI service took too long.");
    }
    log("ai-move: could not reach the provider");
    return fail(502, "The AI service is unavailable.");
  }
}
