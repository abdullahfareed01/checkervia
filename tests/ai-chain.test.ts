import { afterEach, describe, expect, it, vi } from "vitest";
import { initialBoard, getLegalMoves } from "../src/engine";
import { EngineFallbackError, promptForContext, readContext } from "../src/ai/request";
import type { ModelContext } from "../src/ai/request";
import { callProvider, validTaunt } from "../netlify/ai/adapter";
import { runChain, CHAIN_BUDGET_MS } from "../netlify/ai/chain";
import { cooldownUntil, createCooldownStore, nextPacificMidnight, nextUtcMidnight } from "../netlify/ai/cooldowns";
import { FREE_PROVIDERS, providersFromEnv } from "../netlify/ai/providers";
import type { Env, Provider } from "../netlify/ai/providers";
import { providerOrder } from "../netlify/ai/ranking";
import type { ModelMeasurement } from "../netlify/ai/ranking";
import { chooseMove } from "../src/ai/chooseMove";
import { createCallModel } from "../src/ai/client";
import { handleAiMove } from "../netlify/aiMoveHandler";
import { createRateLimiter } from "../netlify/rateLimiter";
import { requestTaunt, tauntEvent } from "../src/ai/taunt";
import { AI_LEVELS } from "../src/ai/difficulty";

const context: ModelContext = { job: "move", board: initialBoard(), player: "black", level: 2, opening: false, candidates: [0, 1], scores: [1, 2] };
const secret = "private-credential-never-log";
const env: Env = Object.fromEntries(FREE_PROVIDERS.map(p => [p.keyEnv, secret]));
const p = FREE_PROVIDERS[0]!;
const reply = (text = '{"move":1,"reason":"The moved piece cannot be captured next turn."}') => new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, completion_tokens_details: { reasoning_tokens: 30 } } }));
const fakeFetch = (fn: (url: string, init?: RequestInit) => Promise<Response>): typeof fetch => fn as typeof fetch;
afterEach(() => vi.useRealTimers());

describe.each(FREE_PROVIDERS)("compatible adapter: $id", provider => {
  it.each([402, 429, 500, 501, 502, 503, 504, 599, 401, 403])("classifies HTTP %i and fails over without leaking content", async status => {
    const send = fakeFetch(async () => new Response(JSON.stringify({ message: secret }), { status }));
    const result = await callProvider(provider, env, "board only", "move", 2, send);
    expect(result).toMatchObject({ ok: false, code: String(status), status });
    const next = { ...p, id: "next", group: "next" };
    const chainFetch = vi.fn().mockResolvedValueOnce(new Response(secret, { status })).mockResolvedValueOnce(reply());
    const logs: unknown[] = [];
    const result2 = await runChain(context, { env: { ...env, AI_PROVIDER_ORDER: `${provider.id},next` }, providers: [provider, next], fetch: chainFetch, store: createCooldownStore({}, chainFetch), log: entry => logs.push(entry) });
    expect(result2).toMatchObject({ provider: "next", attempts: 2 });
    expect(logs).toEqual([{ provider: provider.id, code: String(status), attempts: 1 }]);
    expect(JSON.stringify(logs)).not.toContain(secret);
  });
  it.each(["not JSON", '{"move":0}', '{"move":3}', '{"move":"1"}', '{"move":1.2}', '{"reaction":"hi"}'])("rejects invalid candidate reply %s", async text => {
    expect(await callProvider(provider, env, "board only", "move", 2, fakeFetch(async () => reply(text)))).toMatchObject({ ok: false, code: "INVALID_REPLY" });
    const send = vi.fn().mockResolvedValueOnce(reply(text)).mockResolvedValueOnce(reply());
    const next = { ...p, id: "next", group: "next" };
    expect(await runChain(context, { env: { ...env, AI_PROVIDER_ORDER: `${provider.id},next` }, providers: [provider, next], store: createCooldownStore({}, send), fetch: send })).toMatchObject({ provider: "next", attempts: 2 });
  });
  it("bounds a hung fetch independently of abort support", async () => {
    vi.useFakeTimers();
    const send = vi.fn(() => new Promise<Response>(() => {}));
    const pending = callProvider(provider, env, "board", "move", 2, send);
    await vi.advanceTimersByTimeAsync(provider.timeoutMs);
    expect(await pending).toMatchObject({ ok: false, code: "TIMEOUT", elapsedMs: provider.timeoutMs });
    expect((send.mock.calls[0] as unknown[])[1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });
  it("moves to the next provider after a timeout or unparseable response body", async () => {
    vi.useFakeTimers();
    const next = { ...provider, id: "next", group: "next" };
    const send = vi.fn().mockImplementationOnce(() => new Promise<Response>(() => {})).mockImplementationOnce(async () => reply());
    const deps = { env: { ...env, AI_PROVIDER_ORDER: `${provider.id},next` }, providers: [provider, next], store: createCooldownStore({}, send), fetch: send };
    const pending = runChain(context, deps);
    await vi.advanceTimersByTimeAsync(provider.timeoutMs);
    expect(await pending).toMatchObject({ provider: "next", attempts: 2 });
    send.mockReset().mockResolvedValueOnce(new Response("unparseable")).mockImplementationOnce(async () => reply());
    expect(await runChain(context, deps)).toMatchObject({ provider: "next", attempts: 2 });
  });
  it("bounds a hung response body too", async () => {
    vi.useFakeTimers();
    const send = fakeFetch(async () => ({ ok: true, headers: new Headers(), text: () => new Promise<string>(() => {}) }) as Response);
    const pending = callProvider(provider, env, "board", "move", 2, send);
    await vi.advanceTimersByTimeAsync(provider.timeoutMs);
    expect(await pending).toMatchObject({ code: "TIMEOUT" });
  });
  it("treats connection errors and HTTP 200 embedded errors as failures", async () => {
    expect(await callProvider(provider, env, "board", "move", 2, fakeFetch(async () => { throw new Error(secret); }))).toMatchObject({ code: "NETWORK" });
    const send = fakeFetch(async () => new Response(JSON.stringify({ error: { code: 429, message: secret } })));
    expect(await callProvider(provider, env, "board", "move", 2, send)).toMatchObject({ code: "429", status: 429 });
  });
  it("reads reasoning as a subset of completion tokens and sends the same protocol", async () => {
    const send = vi.fn().mockImplementation(async () => reply());
    expect(await callProvider(provider, env, "board", "move", 2, send)).toMatchObject({ ok: true, usage: { input: 100, output: 50, reasoning: 30, total: 150 } });
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe(`${provider.baseUrl}/chat/completions`);
    expect(JSON.parse(init.body)).toMatchObject({ model: provider.model, messages: [{ role: "user", content: "board" }], max_tokens: 768, stream: false });
  });
  it("blocks echoed credentials even inside an otherwise valid reply", async () => {
    const result = await callProvider(provider, env, "board", "move", 2, fakeFetch(async () => reply(JSON.stringify({ move: 1, reason: secret }))));
    expect(result).toMatchObject({ ok: false, code: "INVALID_REPLY", usage: { total: 150 } });
    expect("text" in result).toBe(false);
  });
});

describe("chain deadlines, cooldowns and safe fallback", () => {
  it("walks the explicit chain in order; missing keys do not make requests", async () => {
    const providers = [p, { ...p, id: "second", group: "second" }, { ...p, id: "third", group: "third" }, { ...p, id: "absent", keyEnv: "ABSENT_KEY" }];
    const send = vi.fn().mockResolvedValueOnce(reply("nonsense")).mockResolvedValueOnce(reply('{"move":99}')).mockResolvedValueOnce(reply('{"move":2}'));
    const result = await runChain(context, { env: { ...env, AI_PROVIDER_ORDER: "absent,third,second,groq-small" }, providers, store: createCooldownStore({}, send), fetch: send });
    expect(result).toMatchObject({ provider: "groq-small", attempts: 3 });
    expect(send).toHaveBeenCalledTimes(3);
  });
  it("skips a cooling group without waiting and automatically uses it after expiry", async () => {
    let time = 1000;
    const send = vi.fn().mockImplementation(async () => reply());
    const store = createCooldownStore({}, send, () => time);
    await store.cool({ provider: p.group, cooldownUntil: 5000, lastErrorCode: "429", updatedAt: time });
    const next = { ...p, id: "next", group: "next" };
    const deps = { env, providers: [p, next], store, fetch: send, now: () => time };
    expect(await runChain(context, deps)).toMatchObject({ provider: "next", attempts: 1 });
    expect(time).toBe(1000);
    time = 5000;
    expect(await runChain(context, deps)).toMatchObject({ provider: p.id, attempts: 1 });
  });
  it("limits all hung attempts together, rather than multiplying the full timeout", async () => {
    vi.useFakeTimers();
    const send = vi.fn(() => new Promise<Response>(() => {}));
    const providers = Array.from({ length: 6 }, (_, i) => ({ ...p, id: `p-${i}`, group: `p-${i}` }));
    const pending = runChain(context, { env, providers, store: createCooldownStore({}, send), fetch: send });
    await vi.advanceTimersByTimeAsync(CHAIN_BUDGET_MS);
    expect(await pending).toEqual({ fallback: true, attempts: 3 });
    expect(send).toHaveBeenCalledTimes(3);
  });
  it("has no network or store delay when no keys are configured", async () => {
    const send = vi.fn();
    expect(await runChain(context, { env: {}, providers: providersFromEnv({}), store: createCooldownStore({}, send), fetch: send })).toEqual({ fallback: true, attempts: 0 });
    expect(send).not.toHaveBeenCalled();
  });
  it("includes unreachable shared reads and writes within the same total budget", async () => {
    vi.useFakeTimers();
    let modelCalls = 0;
    const send = vi.fn(async (url: string) => {
      if (url.includes("/rest/v1/")) return new Promise<Response>(() => {});
      modelCalls++;
      return modelCalls === 1 ? new Response("limit", { status: 429, headers: { "retry-after": "60" } }) : new Promise<Response>(() => {});
    });
    const providers = Array.from({ length: 8 }, (_, i) => ({ ...p, id: `p-${i}`, group: `p-${i}` }));
    const start = Date.now();
    const pending = runChain(context, { env, providers, store: createCooldownStore({ SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: secret }, send as typeof fetch), fetch: send as typeof fetch });
    await vi.advanceTimersByTimeAsync(CHAIN_BUDGET_MS);
    expect(await pending).toMatchObject({ fallback: true });
    expect(Date.now() - start).toBe(CHAIN_BUDGET_MS);
    expect(modelCalls).toBe(4);
  });
  it("accepts only legal engine choices when every provider fails, including Easy", async () => {
    for (const level of [1, 2, 3, 4] as const) {
      const legal = getLegalMoves(context.board, context.player);
      const scores = legal.map((_, i) => i === 3 ? 100 : 0);
      const result = await chooseMove(context.board, context.player, async () => { throw new EngineFallbackError(); }, 0, { engineFallback: true, level, analyze: async () => ({ depth: level, scores }), random: () => 0 });
      expect(result).toMatchObject({ ok: true, move: legal[3], lookahead: { source: "engine", score: 100, depth: AI_LEVELS[level].depth } });
      if (result.ok) expect(legal).toContainEqual(result.move);
    }
  });
  it("keeps parseReply as the final browser guard even if the server sends an invalid move", async () => {
    const result = await chooseMove(context.board, context.player, async () => '{"move":999}', 0, { level: 2, engineFallback: true });
    expect(result).toMatchObject({ ok: true, lookahead: { source: "engine" } });
    if (result.ok) expect(getLegalMoves(context.board, context.player)).toContainEqual(result.move);
  });
});

describe("reset parsing", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  it.each([
    [{ "retry-after": "12" }, now + 12000],
    [{ "retry-after": "Tue, 17 Nov 2026 12:01:00 GMT" }, now + 60000],
    [{ "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "2m30.5s" }, now + 150500],
    [{ "x-ratelimit-reset": String((now + 10000) / 1000) }, now + 10000],
    [{ "x-ratelimit-reset": String(now + 10000) }, now + 10000],
    [{ "x-ratelimit-reset-requests-day": "120" }, now + 120000],
  ])("uses provider reset information %j", (headers, expected) => expect(cooldownUntil(p, new Headers(headers), {}, now)).toBe(expected));
  it("does not use a nonexhausted daily counter for a minute limit", () => {
    expect(cooldownUntil(p, new Headers({ "retry-after": "10", "x-ratelimit-remaining-requests": "999", "x-ratelimit-reset-requests": "12h", "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "7s" }), {}, now)).toBe(now + 10000);
  });
  it("ignores impossible reset timestamps and detects camel case minute quotas", () => {
    expect(cooldownUntil(p, new Headers({ "retry-after": "1e300", "x-ratelimit-reset": "999999999999999999999999999999999999" }), {}, now)).toBe(now + 300000);
    expect(cooldownUntil(FREE_PROVIDERS.at(-1)!, new Headers(), { quotaId: "GenerateRequestsPerMinutePerProject" }, now)).toBe(now + 300000);
  });
  it("understands response-body reset timestamps and Google retry durations", () => {
    expect(cooldownUntil(p, new Headers(), { error: { metadata: { resets_at: "2026-11-18T00:00:00Z" } } }, now)).toBe(nextUtcMidnight(now));
    expect(cooldownUntil(p, new Headers(), { error: { details: [{ retryDelay: "35s" }] } }, now)).toBe(now + 35000);
  });
  it("defaults minute errors to five minutes, daily errors and Cloudflare to UTC midnight", () => {
    expect(cooldownUntil(p, new Headers(), { limit: "TPM" }, now)).toBe(now + 300000);
    expect(cooldownUntil(p, new Headers(), { limit: "RPD" }, now)).toBe(nextUtcMidnight(now));
    expect(cooldownUntil(FREE_PROVIDERS[2]!, new Headers(), {}, now)).toBe(nextUtcMidnight(now));
  });
  it.each([["2026-07-01T12:00Z", "2026-07-02T07:00Z"], ["2026-11-17T12:00Z", "2026-11-18T08:00Z"], ["2026-03-08T08:30Z", "2026-03-09T07:00Z"]])("respects Pacific midnight and DST: %s", (start, end) => expect(nextPacificMidnight(Date.parse(start))).toBe(Date.parse(end)));
});

describe("shared state outages", () => {
  const databaseEnv = { SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: secret };
  it("shares cooldowns with new secret keys without treating them as JWTs", async () => {
    const key = "sb_secret_test_credential_not_real";
    const rows: Record<string, unknown>[] = [];
    const send = fakeFetch(async (url, init) => {
      const headers = new Headers(init?.headers);
      // Match the gateway's rejection of non-JWT API keys as Bearer tokens.
      if (headers.has("Authorization")) return new Response(null, { status: 401 });
      expect(headers.get("apikey")).toBe(key);
      if (url.includes("/rpc/")) {
        const r = JSON.parse(init!.body as string);
        rows.push({ provider: r.p_provider, cooldown_until: r.p_until, last_error_code: r.p_code, updated_at: new Date(1000).toISOString() });
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(rows));
    });
    const env = { ...databaseEnv, SUPABASE_SERVICE_ROLE_KEY: key };
    await createCooldownStore(env, send, () => 1000).cool({ provider: "groq", cooldownUntil: 10000, lastErrorCode: "429", updatedAt: 1000 });
    expect((await createCooldownStore(env, send, () => 1000).read()).get("groq")?.cooldownUntil).toBe(10000);
  });
  it("retains Bearer authentication for legacy service-role keys", async () => {
    const key = "eyJ.test.signature";
    const send = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("[]"));
    await createCooldownStore({ ...databaseEnv, SUPABASE_SERVICE_ROLE_KEY: key }, send).read();
    expect(new Headers(send.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(`Bearer ${key}`);
  });
  it("persists cooldowns across cold connections with ordinary network latency", async () => {
    vi.useFakeTimers();
    const rows: Record<string, unknown>[] = [];
    const send = fakeFetch(async (url, init) => {
      await new Promise(resolve => setTimeout(resolve, url.includes("/rpc/") ? 350 : 300));
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (url.includes("/rpc/")) {
        const row = JSON.parse(init!.body as string);
        rows.push({ provider: row.p_provider, cooldown_until: row.p_until, last_error_code: row.p_code, updated_at: new Date().toISOString() });
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(rows));
    });
    const now = Date.now();
    const first = createCooldownStore(databaseEnv, send);
    const write = first.cool({ provider: "groq", cooldownUntil: now + 10000, lastErrorCode: "429", updatedAt: now });
    await vi.advanceTimersByTimeAsync(350); await write;
    const read = createCooldownStore(databaseEnv, send).read();
    await vi.advanceTimersByTimeAsync(300);
    expect((await read).get("groq")?.cooldownUntil).toBe(now + 10000);
  });
  it("carries a cooldown between separate function instances", async () => {
    const rows: Record<string, unknown>[] = [];
    const send = fakeFetch(async (url, init) => {
      expect(init?.headers).toMatchObject({ apikey: secret });
      if (url.includes("/rpc/")) {
        const r = JSON.parse(init!.body as string);
        rows.push({ provider: r.p_provider, cooldown_until: r.p_until, last_error_code: r.p_code, updated_at: "2026-11-17T00:00:00Z" });
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(rows));
    });
    const time = Date.parse("2026-11-17T00:00:00Z");
    const one = createCooldownStore(databaseEnv, send, () => time);
    await one.cool({ provider: "groq", cooldownUntil: time + 10000, lastErrorCode: "429", updatedAt: time });
    const two = createCooldownStore(databaseEnv, send, () => time);
    expect((await two.read()).get("groq")?.cooldownUntil).toBe(time + 10000);
  });
  it.each(["throw", "http", "malformed", "hang"])("keeps working when the table is unreachable: %s", async failure => {
    vi.useFakeTimers();
    const send = fakeFetch(async () => {
      if (failure === "throw") throw new Error(secret);
      if (failure === "http") return new Response("denied", { status: 503 });
      if (failure === "malformed") return new Response("{bad");
      return new Promise<Response>(() => {});
    });
    const store = createCooldownStore(databaseEnv, send);
    const now = Date.now();
    const write = store.cool({ provider: "groq", cooldownUntil: now + 10000, lastErrorCode: "429", updatedAt: now });
    await vi.advanceTimersByTimeAsync(750); await write;
    const read = store.read(); await vi.advanceTimersByTimeAsync(500);
    expect((await read).get("groq")?.cooldownUntil).toBe(now + 10000);
  });
});

describe("quality routing and config", () => {
  const a = { ...p, id: "a", model: "a" }, b = { ...p, id: "b", model: "b" };
  const measurement = (id: string, quality: number, medianMs: number): ModelMeasurement => ({ id, model: id, complete: true, samples: 168, validRate: quality, topRate: quality, bestRate: quality, truthRate: quality, tauntRate: 1, medianMs, slowestMs: medianMs, averageTokens: 100 });
  const measured = [measurement("a", 1, 3000), measurement("b", 0.8, 100)];
  it.each([1, 2, 3, 4] as const)("routes level %i and opening/job independently", level => {
    expect(providerOrder([a, b], { job: "move", level, opening: false }, {}, measured)[0]?.id).toBe(level >= 3 ? "a" : "b");
    expect(providerOrder([a, b], { job: "move", level, opening: true }, {}, measured)[0]?.id).toBe("a");
    expect(providerOrder([a, b], { job: "taunt", level, opening: true }, {}, measured)[0]?.id).toBe("b");
  });
  it("demotes slow models and lets a manual override win", () => {
    const slow = [measurement("a", 1, 4000), measurement("b", 0.8, 100)];
    expect(providerOrder([a, b], { job: "move", level: 4, opening: true }, {}, slow).map(p => p.id)).toEqual(["b", "a"]);
    expect(providerOrder([a, b], { job: "move", level: 4, opening: true }, { AI_MOVE_PROVIDER_ORDER: "a,a,missing,b" }, slow).map(p => p.id)).toEqual(["a", "b"]);
  });
  it("ignores incomplete and old-model measurements", () => {
    expect(providerOrder([a, b], context, {}, [{ ...measured[0]!, complete: false }, { ...measured[1]!, model: "old" }]).map(p => p.id)).toEqual(["a", "b"]);
  });
  it("uses latency for the current job and supports both global and job overrides", () => {
    const mixed = [{ ...measured[0]!, moveMedianMs: 100, tauntMedianMs: 4000 }, { ...measured[1]!, moveMedianMs: 200, tauntMedianMs: 100 }];
    expect(providerOrder([a, b], { job: "move", level: 4, opening: true }, {}, mixed)[0]?.id).toBe("a");
    expect(providerOrder([a, b], { job: "taunt", level: 4, opening: true }, {}, mixed)[0]?.id).toBe("b");
    for (const job of ["move", "taunt"] as const) expect(providerOrder([a, b], { job, level: 4, opening: true }, { AI_PROVIDER_ORDER: "b,a" }, measured)[0]?.id).toBe("b");
    expect(providerOrder([a, b], { job: "taunt", level: 4, opening: true }, { AI_PROVIDER_ORDER: "b,a", AI_TAUNT_PROVIDER_ORDER: "a,b" }, measured)[0]?.id).toBe("a");
  });
  it("skips absent keys and conditional Gemini, and supports configuration without code", () => {
    expect(providersFromEnv({})).toEqual([]);
    expect(providersFromEnv({ GEMINI_API_KEY: secret })).toEqual([]);
    expect(providersFromEnv({ GEMINI_API_KEY: secret, AI_ENABLE_GEMINI_FREE: "1" })).toHaveLength(1);
    const custom: Provider = { ...p, id: "custom", group: "custom", model: "free-model", keyEnv: "CUSTOM_API_KEY" };
    expect(providersFromEnv({ AI_PROVIDERS_JSON: JSON.stringify([custom]), CUSTOM_API_KEY: secret })).toEqual([custom]);
    expect(providersFromEnv({ AI_PROVIDERS_JSON: "invalid", GROQ_API_KEY: secret })).toEqual([]);
    expect(providersFromEnv({ AI_PROVIDERS_JSON: JSON.stringify([{ ...custom, id: null }]), CUSTOM_API_KEY: secret })).toEqual([]);
    expect(providersFromEnv({ GROQ_API_KEY: secret, AI_GROQ_SMALL_BASE_URL: "http://unsafe.example" }).map(p => p.id)).toEqual(["groq-large"]);
  });
  it("reserves quality models for hard jobs even when they have the better taunt score", () => {
    const light: Provider = { ...b, tier: "fast" };
    const heavy: Provider = { ...a, tier: "quality" };
    const scores = [measurement("a", 1, 200), { ...measurement("b", 0.8, 400), tauntRate: 0.9 }];
    for (const level of [1, 2] as const) expect(providerOrder([heavy, light], { job: "move", level, opening: false }, {}, scores)[0]?.id).toBe("b");
    for (const level of [1, 2, 3, 4] as const) {
      expect(providerOrder([heavy, light], { job: "taunt", level, opening: true }, {}, scores)[0]?.id).toBe("b");
      expect(providerOrder([heavy, light], { job: "move", level, opening: true }, {}, scores)[0]?.id).toBe("a");
    }
    for (const level of [3, 4] as const) expect(providerOrder([heavy, light], { job: "move", level, opening: false }, {}, scores)[0]?.id).toBe("a");
    expect(providerOrder([heavy, light], { job: "taunt", level: 1, opening: false }, { AI_TAUNT_PROVIDER_ORDER: "a,b" }, scores)[0]?.id).toBe("a");
    const slowLight = scores.map(m => m.id === "b" ? { ...m, tauntMedianMs: 4000 } : m);
    expect(providerOrder([heavy, light], { job: "taunt", level: 1, opening: false }, {}, slowLight)[0]?.id).toBe("a");
  });
});

describe("proxy privacy and browser protocol", () => {
  it("rebuilds from validated board data and ignores arbitrary prompt/player fields", async () => {
    const send = vi.fn().mockResolvedValue(reply());
    const limiter = createRateLimiter({ limit: 20, windowMs: 60000 });
    const result = await handleAiMove({ method: "POST", clientId: "x", body: JSON.stringify({ context, prompt: secret, playerName: secret }) }, { env: {}, fetch: send, limiter, chain: { env, providers: [p], store: createCooldownStore({}, send), fetch: send } });
    expect(result.status).toBe(200);
    expect(JSON.stringify(JSON.parse(send.mock.calls[0]![1].body).messages)).not.toContain(secret);
    expect(readContext({ ...context, name: secret })).toBeNull();
    expect(readContext({ ...context, candidates: [999] })).toBeNull();
    expect(readContext({ ...context, board: [] })).toBeNull();
    expect(promptForContext(context)).toContain("checked statements");
  });
  it("always reports engine readiness and returns a fallback marker with zero keys", async () => {
    const send = vi.fn();
    const deps = { env: {}, fetch: send, limiter: createRateLimiter({ limit: 1, windowMs: 60000 }), chain: { env: {}, providers: [], store: createCooldownStore({}, send), fetch: send } };
    expect(await handleAiMove({ method: "GET", body: "", clientId: "x" }, deps)).toEqual({ status: 200, body: { ready: true } });
    const request = { method: "POST", body: JSON.stringify({ context }), clientId: "x" };
    expect(await handleAiMove(request, deps)).toEqual({ status: 200, body: { fallback: true } });
    expect(await handleAiMove(request, deps)).toEqual({ status: 200, body: { fallback: true } });
  });
  it("the modern client sends no prompt text and recognizes only the server fallback marker", async () => {
    const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ fallback: true })));
    const call = createCallModel({ chain: true, fetch: send });
    await expect(call(secret, secret, undefined, context)).rejects.toBeInstanceOf(EngineFallbackError);
    expect(JSON.parse(send.mock.calls[0]![1].body)).toEqual({ context });
  });
  it.each(["greeting", "move-2", "idle-1-1", "end-40"])("routes taunt %s as a fast job and keeps local fallback on errors", async key => {
    const call = vi.fn().mockResolvedValue('{"reaction":"Your move, rival!"}');
    const c = { ...context, event: tauntEvent(key) };
    expect(await requestTaunt(c, undefined, call)).toBe("Your move, rival!");
    expect(call.mock.calls[0]?.[3]).toMatchObject({ job: "taunt", candidates: [], event: tauntEvent(key) });
    expect(await requestTaunt(c, undefined, async () => { throw new Error(secret); })).toBeNull();
  });
  it("checks taunt format and language, including rematch", () => {
    expect(tauntEvent("greeting", true)).toBe("rematch");
    expect(validTaunt('{"reaction":"Your move!"}')).toBe(true);
    expect(validTaunt('{"reaction":"shit"}')).toBe(false);
    expect(validTaunt('{"move":1}')).toBe(false);
  });
});
