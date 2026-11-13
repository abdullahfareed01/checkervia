// Tests for the AI proxy's request handling, with a fake fetch and a fake
// limiter. No real network calls and no real key.
import { describe, expect, it } from "vitest";
import {
  MAX_OUTPUT_TOKENS,
  MAX_PROMPT_CHARS,
  MAX_RETRY_NOTE_CHARS,
  PROVIDER_TIMEOUT_MS,
  PROVIDER_URL,
  handleAiMove,
} from "../netlify/aiMoveHandler";
import type { HandlerDeps, HandlerRequest } from "../netlify/aiMoveHandler";
import { createRateLimiter } from "../netlify/rateLimiter";

const KEY = "sk-test-key-123";
const MODEL = "openai/gpt-oss-120b";
const ENV = { OPENROUTER_API_KEY: KEY, LLM_MODEL: MODEL };

function post(body: unknown, clientId = "1.2.3.4"): HandlerRequest {
  return { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), clientId };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function providerAnswer(content: unknown, finishReason = "stop"): Response {
  return jsonResponse({ choices: [{ message: { content }, finish_reason: finishReason }] });
}

// A fake fetch that plays back a script and records what it was asked.
function scriptedFetch(script: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const step = script[calls.length - 1];
    if (step === undefined) throw new Error("unexpected extra provider call");
    if (step instanceof Error) throw step;
    return step;
  };
  return { fetch: fakeFetch, calls };
}

function bodyOfCall(calls: { init: RequestInit }[], index: number) {
  return JSON.parse(calls[index]!.init.body as string);
}

function makeDeps(
  script: (Response | Error)[],
  overrides: Partial<HandlerDeps> = {},
): { deps: HandlerDeps; calls: ReturnType<typeof scriptedFetch>["calls"]; logs: string[] } {
  const { fetch: fakeFetch, calls } = scriptedFetch(script);
  const logs: string[] = [];
  const deps: HandlerDeps = {
    env: ENV,
    fetch: fakeFetch,
    limiter: { allow: () => true },
    log: (message) => logs.push(message),
    ...overrides,
  };
  return { deps, calls, logs };
}

describe("handleAiMove: request validation", () => {
  it("accepts only POST (and GET, the health check)", async () => {
    const { deps, calls } = makeDeps([]);
    for (const method of ["PUT", "DELETE", "OPTIONS", "PATCH"]) {
      const result = await handleAiMove({ method, body: "", clientId: "x" }, deps);
      expect(result.status).toBe(405);
    }
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["an empty body", ""],
    ["a JSON array", "[]"],
    ["a JSON string", '"hello"'],
    ["null", "null"],
    ["a missing prompt", { retryNote: "x" }],
    ["an empty prompt", { prompt: "" }],
    ["a blank prompt", { prompt: "   " }],
    ["a prompt that is not a string", { prompt: 5 }],
    ["a retryNote that is not a string", { prompt: "hi", retryNote: 5 }],
    ["a null retryNote", { prompt: "hi", retryNote: null }],
    ["an extra field", { prompt: "hi", model: "something-expensive" }],
    ["a prompt over the limit", { prompt: "a".repeat(MAX_PROMPT_CHARS + 1) }],
    ["a retryNote over the limit", { prompt: "hi", retryNote: "a".repeat(MAX_RETRY_NOTE_CHARS + 1) }],
    ["a huge body", JSON.stringify({ prompt: "hi", retryNote: "a".repeat(20_000) })],
  ])("rejects %s with 400 and a generic message, without calling the provider", async (_name, body) => {
    const { deps, calls } = makeDeps([]);
    const result = await handleAiMove(post(body), deps);

    expect(result).toEqual({ status: 400, body: { error: "Invalid request." } });
    expect(calls).toHaveLength(0);
  });

  it("accepts a prompt and retryNote exactly at their limits", async () => {
    const { deps } = makeDeps([providerAnswer('{"move": 1}')]);
    const result = await handleAiMove(
      post({ prompt: "a".repeat(MAX_PROMPT_CHARS), retryNote: "b".repeat(MAX_RETRY_NOTE_CHARS) }),
      deps,
    );
    expect(result.status).toBe(200);
  });
});

describe("handleAiMove: a good request", () => {
  it("returns only { text } with the model's message content", async () => {
    const { deps } = makeDeps([providerAnswer('{"move": 3}')]);
    const result = await handleAiMove(post({ prompt: "Position..." }), deps);

    expect(result).toEqual({ status: 200, body: { text: '{"move": 3}' } });
  });

  it("calls OpenRouter with the key, the model from LLM_MODEL and the reasoning settings", async () => {
    const { deps, calls } = makeDeps([providerAnswer('{"move": 3}')]);
    await handleAiMove(post({ prompt: "Position..." }), deps);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(PROVIDER_URL);
    expect(PROVIDER_URL).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });

    const body = bodyOfCall(calls, 0);
    expect(body.model).toBe(MODEL);
    expect(body.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(MAX_OUTPUT_TOKENS).toBe(1500);
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.messages).toEqual([{ role: "user", content: "Position..." }]);
  });

  it("asks for structured output: a JSON schema for { move: integer, reason: string }", async () => {
    const { deps, calls } = makeDeps([providerAnswer('{"move": 3}')]);
    await handleAiMove(post({ prompt: "p" }), deps);

    expect(bodyOfCall(calls, 0).response_format).toEqual({
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
    });
  });

  it("adds the retry note to the prompt it forwards", async () => {
    const { deps, calls } = makeDeps([providerAnswer('{"move": 2}')]);
    await handleAiMove(post({ prompt: "Position...", retryNote: "Move 9 is not in the list." }), deps);

    const content = bodyOfCall(calls, 0).messages[0].content as string;
    expect(content.startsWith("Position...")).toBe(true);
    expect(content).toContain("Move 9 is not in the list.");
  });

  it("passes an abort signal so the provider call can time out", async () => {
    const { deps, calls } = makeDeps([providerAnswer('{"move": 1}')]);
    await handleAiMove(post({ prompt: "p" }), deps);
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("times out the provider call before Netlify's 60 second function limit", () => {
    expect(PROVIDER_TIMEOUT_MS).toBeLessThan(60_000);
    expect(PROVIDER_TIMEOUT_MS).toBeGreaterThanOrEqual(50_000);
  });
});

describe("handleAiMove: bad answers from the provider", () => {
  it.each([
    ["an empty content string", providerAnswer("")],
    ["whitespace only", providerAnswer("   \n")],
    ["null content", providerAnswer(null)],
    ["content that is not a string", providerAnswer(["move", 3])],
    ["reasoning that used all the tokens (finish_reason length, empty content)", providerAnswer("", "length")],
    ["no choices", jsonResponse({ choices: [] })],
    ["no message", jsonResponse({ choices: [{}] })],
    ["a 200 with an error body", jsonResponse({ error: { message: "upstream broke" } })],
    ["a body that is not JSON", new Response("<html>oops</html>", { status: 200 })],
  ])("returns 502 for %s", async (_name, providerReply) => {
    const { deps } = makeDeps([providerReply]);
    const result = await handleAiMove(post({ prompt: "p" }), deps);

    expect(result.status).toBe(502);
    expect(result.body).toHaveProperty("error");
    expect(result.body).not.toHaveProperty("text");
  });

  it("returns 502 with a generic message when the provider fails, and hides its error", async () => {
    const secret = "internal upstream detail 42";
    const { deps, logs } = makeDeps([jsonResponse({ error: { message: secret } }, 500)]);
    const result = await handleAiMove(post({ prompt: "p" }), deps);

    expect(result).toEqual({ status: 502, body: { error: "The AI service is unavailable." } });
    expect(JSON.stringify(result)).not.toContain(secret);
    // It is logged on the server so the developer can see it.
    expect(logs.join("\n")).toContain("status 500");
  });

  it("returns 504 when the provider call times out", async () => {
    const { deps } = makeDeps([new DOMException("The operation timed out.", "TimeoutError")]);
    const result = await handleAiMove(post({ prompt: "p" }), deps);
    expect(result).toEqual({ status: 504, body: { error: "The AI service took too long." } });
  });

  it("returns 502 when the provider cannot be reached", async () => {
    const { deps } = makeDeps([new TypeError("fetch failed")]);
    const result = await handleAiMove(post({ prompt: "p" }), deps);
    expect(result.status).toBe(502);
  });

  it("actually gives up when the provider hangs (real timeout)", async () => {
    const hangingFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    const { deps } = makeDeps([], { fetch: hangingFetch, providerTimeoutMs: 30 });
    const result = await handleAiMove(post({ prompt: "p" }), deps);
    expect(result.status).toBe(504);
  });
});

describe("handleAiMove: providers that reject response_format", () => {
  it.each([400, 404, 422])(
    "on status %i, asks once more without response_format and uses that answer",
    async (status) => {
      const { deps, calls, logs } = makeDeps([
        jsonResponse({ error: { message: "No endpoints found that can handle the requested parameters" } }, status),
        providerAnswer('{"move": 4}'),
      ]);
      const result = await handleAiMove(post({ prompt: "p" }), deps);

      expect(result).toEqual({ status: 200, body: { text: '{"move": 4}' } });
      expect(calls).toHaveLength(2);
      expect(bodyOfCall(calls, 0)).toHaveProperty("response_format");

      const second = bodyOfCall(calls, 1);
      expect(second).not.toHaveProperty("response_format");
      // Everything else stays, including the provider filter and reasoning limits.
      expect(second.provider).toEqual({ require_parameters: true });
      expect(second.reasoning).toEqual({ effort: "low" });
      expect(second.max_tokens).toBe(MAX_OUTPUT_TOKENS);
      expect(logs.join("\n")).toContain(`status ${status}`);
    },
  );

  it("returns 502 if the second call fails too, after exactly two provider calls", async () => {
    const { deps, calls } = makeDeps([jsonResponse({}, 404), jsonResponse({}, 404)]);
    const result = await handleAiMove(post({ prompt: "p" }), deps);

    expect(result.status).toBe(502);
    expect(calls).toHaveLength(2);
  });

  it.each([401, 402, 429, 500, 503])("does not retry on status %i", async (status) => {
    const { deps, calls } = makeDeps([jsonResponse({}, status)]);
    const result = await handleAiMove(post({ prompt: "p" }), deps);

    expect(result.status).toBe(502);
    expect(calls).toHaveLength(1);
  });
});

describe("handleAiMove: configuration and secrets", () => {
  it("returns 500 without calling the provider when the key is missing", async () => {
    const { deps, calls, logs } = makeDeps([], { env: { LLM_MODEL: MODEL } });
    const result = await handleAiMove(post({ prompt: "p" }), deps);

    expect(result).toEqual({ status: 500, body: { error: "The AI service is not configured." } });
    expect(calls).toHaveLength(0);
    expect(logs.join("\n")).toContain("OPENROUTER_API_KEY");
  });

  it("returns 500 when LLM_MODEL is missing or empty", async () => {
    for (const env of [{ OPENROUTER_API_KEY: KEY }, { OPENROUTER_API_KEY: KEY, LLM_MODEL: "" }]) {
      const { deps, calls } = makeDeps([], { env });
      const result = await handleAiMove(post({ prompt: "p" }), deps);
      expect(result.status).toBe(500);
      expect(calls).toHaveLength(0);
    }
  });

  it("never returns or logs the API key, in any outcome", async () => {
    const echoesKey = jsonResponse({ error: { message: `Invalid API key ${KEY}` } }, 401);
    const scenarios: { request: HandlerRequest; script: (Response | Error)[] }[] = [
      { request: post({ prompt: "p" }), script: [providerAnswer('{"move": 1}')] },
      { request: post({ prompt: "p" }), script: [echoesKey] },
      { request: post({ prompt: "p" }), script: [jsonResponse({}, 404), echoesKey] },
      { request: post({ prompt: "p" }), script: [new Error(`boom ${KEY}`)] },
      { request: post({ prompt: "p" }), script: [new DOMException("t", "TimeoutError")] },
      { request: post({ prompt: "p" }), script: [providerAnswer("")] },
      { request: post("{bad"), script: [] },
      { request: { method: "GET", body: "", clientId: "x" }, script: [] },
    ];

    for (const { request, script } of scenarios) {
      const { deps, logs } = makeDeps(script);
      const result = await handleAiMove(request, deps);
      expect(JSON.stringify(result)).not.toContain(KEY);
      expect(logs.join("\n")).not.toContain(KEY);
    }
  });

  it("blanks the key out of a provider error that echoes it", async () => {
    const { deps, logs } = makeDeps([jsonResponse({ error: { message: `Invalid API key ${KEY}` } }, 401)]);
    await handleAiMove(post({ prompt: "p" }), deps);
    expect(logs.join("\n")).toContain("[removed]");
  });
});

describe("handleAiMove: rate limiting", () => {
  it("returns 429 once a client is over the limit, without calling the provider", async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const { deps, calls } = makeDeps([providerAnswer("a"), providerAnswer("b")], { limiter });

    expect((await handleAiMove(post({ prompt: "p" }, "ip-1"), deps)).status).toBe(200);
    expect((await handleAiMove(post({ prompt: "p" }, "ip-1"), deps)).status).toBe(200);
    const blocked = await handleAiMove(post({ prompt: "p" }, "ip-1"), deps);

    expect(blocked).toEqual({ status: 429, body: { error: "Too many requests. Please wait a moment." } });
    expect(calls).toHaveLength(2);
  });

  it("limits each client separately", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const { deps } = makeDeps([providerAnswer("a"), providerAnswer("b")], { limiter });

    expect((await handleAiMove(post({ prompt: "p" }, "ip-1"), deps)).status).toBe(200);
    expect((await handleAiMove(post({ prompt: "p" }, "ip-2"), deps)).status).toBe(200);
  });
});

describe("createRateLimiter", () => {
  it("allows up to the limit, then refuses", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect([1, 2, 3, 4].map(() => limiter.allow("a"))).toEqual([true, true, true, false]);
  });

  it("allows again once the window has passed", () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });

    expect(limiter.allow("a")).toBe(true);
    time = 999;
    expect(limiter.allow("a")).toBe(false);
    time = 1000;
    expect(limiter.allow("a")).toBe(true);
  });

  it("does not count refused requests, so waiting really does help", () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });

    limiter.allow("a");
    for (time = 100; time < 900; time += 100) limiter.allow("a"); // all refused
    time = 1000;
    expect(limiter.allow("a")).toBe(true);
  });

  it("forgets old clients so memory stays bounded", () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time, maxClients: 3 });

    ["a", "b", "c", "d", "e"].forEach((id) => limiter.allow(id));
    // The oldest were dropped, so "a" is treated as new and allowed again.
    expect(limiter.allow("a")).toBe(true);
    // "e" was seen recently and is still remembered.
    expect(limiter.allow("e")).toBe(false);
  });
});

describe("handleAiMove: health check (GET)", () => {
  const get: HandlerRequest = { method: "GET", body: "", clientId: "x" };

  it("says ready when the key and model are set, without calling the provider", async () => {
    const { deps, calls } = makeDeps([]);
    expect(await handleAiMove(get, deps)).toEqual({ status: 200, body: { ready: true } });
    expect(calls).toHaveLength(0);
  });

  it("says not ready when the key or the model is missing", async () => {
    for (const env of [{ LLM_MODEL: MODEL }, { OPENROUTER_API_KEY: KEY }, {}]) {
      const { deps } = makeDeps([], { env });
      expect(await handleAiMove(get, deps)).toEqual({ status: 200, body: { ready: false } });
    }
  });

  it("does not use up the rate limit", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const { deps } = makeDeps([providerAnswer('{"move": 1}')], { limiter });
    for (let i = 0; i < 5; i++) await handleAiMove({ ...get, clientId: "ip-1" }, deps);
    expect((await handleAiMove(post({ prompt: "p" }, "ip-1"), deps)).status).toBe(200);
  });
});
