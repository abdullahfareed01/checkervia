// Request handling for the AI proxy, kept free of Netlify types so tests can
// call it with a fake fetch. The Netlify function (functions/ai-move.ts) is a
// thin wrapper around handleAiMove.
//
// Rules this file keeps:
// - The browser only ever gets { text } or a short generic { error }.
// - The API key and raw provider errors are never returned. The key is never
//   logged (and is blanked out of anything that is).
import type { RateLimiter } from "./rateLimiter";
import type { ServiceErrorCode } from "../src/ai/serviceError";
import { createAiHealthCheck } from "./aiHealth";
import { readContext } from "../src/ai/request";
import { runChain } from "./ai/chain";
import type { ChainDeps } from "./ai/chain";

export const PROVIDER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Limits on what the browser may send.
// Room for the look-ahead scores of the higher AI levels (prompt v3).
export const MAX_PROMPT_CHARS = 8000;
export const MAX_RETRY_NOTE_CHARS = 500;
const MAX_BODY_CHARS = 20_000; // room for JSON escaping of the two fields

// The model is a reasoning model: its thinking tokens count against
// max_tokens, so leave room for thinking plus a tiny {"move": n} answer.
export const MAX_OUTPUT_TOKENS = 1500;

// Return a useful error inside the browser's overall 12 second turn budget.
export const PROVIDER_TIMEOUT_MS = 10_000;

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
  chain?: ChainDeps;
  env: HandlerEnv;
  fetch: typeof fetch;
  limiter: RateLimiter;
  // Chat lines count here, not against the moves' limit, so talk can never
  // push a move onto the engine fallback (D162). Without it, `limiter`.
  talkLimiter?: RateLimiter;
  log?: (message: string) => void;
  providerTimeoutMs?: number;
  checkHealth?: (env: HandlerEnv) => Promise<boolean>;
}

export interface HandlerResponse {
  status: number;
  body: { text: string } | { fallback: true } | { error: string; code?: ServiceErrorCode; retryable?: boolean; retryAfterSeconds?: number } | { ready: boolean };
}

function fail(status: number, error: string, code?: ServiceErrorCode, retryable?: boolean): HandlerResponse {
  return { status, body: { error, ...(code ? { code, retryable: retryable ?? false } : {}) } };
}

function providerFailure(status: number, retryAfterSeconds?: number): HandlerResponse {
  if (status === 402) return fail(502, "The AI service has reached its credit limit.", "credits", false);
  if (status === 401 || status === 403) return fail(502, "The AI service cannot access its provider.", "access", false);
  const result = status === 429
    ? fail(502, "The AI provider is busy.", "busy", true)
    : fail(502, "The AI service is unavailable.", "unavailable", status >= 500 || status === 408);
  if (retryAfterSeconds !== undefined && "error" in result.body) result.body.retryAfterSeconds = retryAfterSeconds;
  return result;
}

function retryAfter(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  if (raw === null) return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : (Date.parse(raw) - Date.now()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
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

// Turns the provider's response into our response. Provider details go to the
// log only (key removed), never to the browser.
async function readProviderResponse(
  response: Response,
  log: (message: string) => void,
): Promise<HandlerResponse> {
  if (!response.ok) {
    log(`status ${response.status}`);
    return providerFailure(response.status, retryAfter(response));
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    log("INVALID_REPLY");
    return fail(502, "The AI service is unavailable.", "invalidReply", true);
  }

  // Some providers return an error object with HTTP 200. Treat it exactly
  // like an HTTP error, rather than losing the actual reason as an empty reply.
  const providerError = (data as { error?: { code?: unknown } } | null)?.error;
  if (providerError) {
    const code = Number(providerError.code);
    log(`status ${Number.isInteger(code) && code >= 400 && code <= 599 ? code : 502}`);
    return providerFailure(Number.isInteger(code) && code >= 400 && code <= 599 ? code : 502, retryAfter(response));
  }

  const text = messageContent(data);
  if (text === null) {
    log("INVALID_REPLY");
    return fail(502, "The AI service returned no usable answer.", "invalidReply", true);
  }
  return { status: 200, body: { text } };
}

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

// Handles one request. Order: health check (GET), method, rate limit, body
// shape, configuration, then the provider call.
export async function handleAiMove(
  request: HandlerRequest,
  deps: HandlerDeps,
): Promise<HandlerResponse> {
  if (deps.chain) {
    // Engine play is always ready; an exhausted external account must never
    // prevent entering a game. Legacy callers retain the old interface below.
    if (request.method === "GET") return { status: 200, body: { ready: true } };
    if (request.method !== "POST") return fail(405, "Method not allowed.");
    if (request.body.length > MAX_BODY_CHARS) return fail(400, "Invalid request.");
    let body: Record<string, unknown>;
    try { body = JSON.parse(request.body) as Record<string, unknown>; } catch { return fail(400, "Invalid request."); }
    const context = readContext(body?.context);
    if (!context) return fail(400, "Invalid request.");
    const limiter = context.job === "taunt" ? deps.talkLimiter ?? deps.limiter : deps.limiter;
    if (!limiter.allow(request.clientId)) return { status: 200, body: { fallback: true } };
    const result = await runChain(context, deps.chain);
    return { status: 200, body: "text" in result ? { text: result.text } : { fallback: true } };
  }
  const log = (code: string) => deps.log?.(JSON.stringify({ provider: "openrouter", code, attempts: 1 }));

  if (request.method === "GET") {
    const check = deps.checkHealth ?? createAiHealthCheck(deps.fetch);
    return { status: 200, body: { ready: await check(deps.env) } };
  }
  if (request.method !== "POST") return fail(405, "Method not allowed.");
  if (!deps.limiter.allow(request.clientId)) {
    return fail(429, "Too many requests. Please wait a moment.", "rateLimit", false);
  }

  const parsed = parseRequestBody(request.body);
  if (!parsed) return fail(400, "Invalid request.");

  const key = deps.env.OPENROUTER_API_KEY;
  const model = deps.env.LLM_MODEL;
  if (!key || !model) {
    log("CONFIGURATION_OPENROUTER_API_KEY_LLM_MODEL");
    return fail(500, "The AI service is not configured.", "configuration", false);
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
      log(`status ${response.status}`);
      response = await send(false);
    }
    return await readProviderResponse(response, log);
  } catch (error) {
    if (isTimeout(error)) {
      log("TIMEOUT");
      return fail(504, "The AI service took too long.", "timeout", true);
    }
    log("NETWORK");
    return fail(502, "The AI service is unavailable.", "unavailable", true);
  }
}
