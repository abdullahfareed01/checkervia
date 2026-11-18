import { describe, expect, it } from "vitest";
import { createAiHealthCheck, HEALTH_CACHE_MS } from "../netlify/aiHealth";

const env = { OPENROUTER_API_KEY: "private-test-key", LLM_MODEL: "test-model" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });

function provider(key: unknown = { limit_remaining: null }, credits: unknown = { total_credits: 1, total_usage: 0 }) {
  const urls: string[] = [];
  const send: typeof fetch = async (input, init) => {
    urls.push(String(input));
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({ Authorization: "Bearer private-test-key" });
    return String(input).endsWith("/key") ? json(key) : json(credits);
  };
  return { urls, send };
}

describe("provider readiness", () => {
  it("checks key access and account credits without calling a model", async () => {
    const { send, urls } = provider();
    expect(await createAiHealthCheck(send)(env)).toBe(true);
    expect(urls.sort()).toEqual(["https://openrouter.ai/api/v1/credits", "https://openrouter.ai/api/v1/key"]);
  });

  it("does not report ready when the key has credit but the account balance is negative", async () => {
    const { send } = provider({ limit_remaining: 0.04 }, { total_credits: 1, total_usage: 1.2 });
    expect(await createAiHealthCheck(send)(env)).toBe(false);
  });

  it.each([0, -1, undefined, "2"])("does not accept exhausted or malformed key balance %s", async (limit_remaining) => {
    expect(await createAiHealthCheck(provider({ limit_remaining }).send)(env)).toBe(false);
  });

  it.each([{ total_credits: 0, total_usage: 0 }, {}, null, { total_credits: "2", total_usage: 0 }])("does not accept exhausted or malformed account data", async (credits) => {
    expect(await createAiHealthCheck(provider({ limit_remaining: null }, credits).send)(env)).toBe(false);
  });

  it("returns false for missing settings, failed authentication, unreadable responses and network errors", async () => {
    const check = createAiHealthCheck(async () => { throw new Error("No fetch for missing config"); });
    expect(await check({})).toBe(false);
    for (const send of [async () => json({}, 401), async () => json({}, 403), async () => new Response("broken"), async () => { throw new TypeError("offline"); }]) {
      expect(await createAiHealthCheck(send)(env)).toBe(false);
    }
  });

  it("shares concurrent checks, caches briefly, and rechecks after the cache expires", async () => {
    let time = 0;
    const { send, urls } = provider();
    const check = createAiHealthCheck(send, () => time);
    expect(await Promise.all([check(env), check(env), check(env)])).toEqual([true, true, true]);
    expect(urls).toHaveLength(2);
    time = HEALTH_CACHE_MS;
    expect(await check(env)).toBe(true);
    expect(urls).toHaveLength(4);
  });

  it("rechecks after key or model settings change instead of reusing stale readiness", async () => {
    const urls: string[] = [];
    const send: typeof fetch = async (input) => {
      urls.push(String(input));
      return String(input).endsWith("/key") ? json({ limit_remaining: null }) : json({ total_credits: 1, total_usage: 0 });
    };
    const check = createAiHealthCheck(send, () => 0);
    await check(env);
    await check({ ...env, OPENROUTER_API_KEY: "rotated" });
    await check({ ...env, LLM_MODEL: "new-model" });
    expect(urls).toHaveLength(6);
  });
});
