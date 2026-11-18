import { describe, expect, it, vi } from "vitest";
import { handleTraffic } from "../netlify/telemetry/handler";
import { createTrafficClient, VISIT_DAY_KEY } from "../src/ui/telemetry/client";
import { gamePresence } from "../src/ui/telemetry/useGameTraffic";
import type { TrafficEvent } from "../src/telemetry/protocol";
const NOW = new Date("2026-11-18T12:00:00Z");
const DEVICE = "device_for_traffic_tests";
const beat = { action: "beat", mode: "ai", level: 4, country: "PK" };
function request(body: unknown, extra: Record<string, string> = {}, method = "POST") {
  return new Request("https://checkervia.example/.netlify/functions/game-presence", { method, headers: {
    "content-type": "application/json", "x-checkervia-device": DEVICE, "x-checkervia-presence": "1", origin: "https://checkervia.example", ...extra,
  }, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
}
function world() { const call = vi.fn(async (_name: string, _params: Record<string, unknown>) => true); return { store: { call }, salt: "private-test-salt", now: () => NOW }; }

describe("game traffic ingestion", () => {
  it("counts one daily visitor through one atomic RPC with only hashed markers", async () => {
    const w = world(); expect((await handleTraffic(request({ action: "visit" }), "203.0.113.5", w)).status).toBe(204);
    expect(w.store.call).toHaveBeenCalledTimes(1);
    expect(w.store.call).toHaveBeenCalledWith("count_visit", expect.objectContaining({ p_day: "2026-11-18", p_limit: 1000, p_mark: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    const params = JSON.stringify(w.store.call.mock.calls); expect(params).not.toContain(DEVICE); expect(params).not.toContain("203.0.113.5");
  });
  it("uses unlinked daily marks but one deduplicated device session", async () => {
    const w = world(); await handleTraffic(request({ action: "visit" }), "ip", w);
    const first = w.store.call.mock.calls[0]![1]["p_mark"];
    await handleTraffic(request({ action: "visit" }), "ip", { ...w, now: () => new Date("2026-11-19") });
    expect(w.store.call.mock.calls[1]![1]["p_mark"]).not.toBe(first);
    await handleTraffic(request(beat), "ip", w); await handleTraffic(request({ action: "end" }), "ip", w);
    expect(w.store.call.mock.calls[2]![1]["p_session"]).toBe(w.store.call.mock.calls[3]![1]["p_session"]);
  });
  it("beats with a bounded TTL and ends through a rate-limited single RPC", async () => {
    const w = world(); expect((await handleTraffic(request(beat), "ip", w)).status).toBe(204);
    expect(w.store.call).toHaveBeenLastCalledWith("presence_beat", expect.objectContaining({ p_mode: "ai", p_level: 4, p_country: "PK", p_ttl_seconds: 75, p_limit: 120 }));
    await handleTraffic(request({ action: "end" }), "ip", w); expect(w.store.call.mock.calls[1]![0]).toBe("game_presence_end");
  });
  it.each([{}, { action: "hack" }, { action: ["visit"] }, { action: { toString: "visit" } }, { ...beat, level: 8 }, { ...beat, mode: "other" }, { ...beat, country: "ZZ" }, { action: "visit", day: "2099-01-01" }, { action: "end", session: "another-device" }, [], "broken"])("refuses invalid events %j before storage", async (body) => {
    const w = world(); expect((await handleTraffic(request(body), "ip", w)).status).toBe(400); expect(w.store.call).not.toHaveBeenCalled();
  });
  it("refuses cross-site calls and a missing device, never supports GET", async () => {
    const w = world(); expect((await handleTraffic(request(beat, { origin: "https://other.example" }), "ip", w)).status).toBe(403);
    expect((await handleTraffic(request(beat, { "sec-fetch-site": "cross-site" }), "ip", w)).status).toBe(403);
    expect((await handleTraffic(request(beat, { "x-checkervia-presence": "" }), "ip", w)).status).toBe(403);
    expect((await handleTraffic(request(beat, { "x-checkervia-device": "" }), "ip", w)).status).toBe(400);
    expect((await handleTraffic(request({}, {}, "GET"), "ip", w)).status).toBe(405); expect(w.store.call).not.toHaveBeenCalled();
  });
  it("returns cooldowns without exposing storage errors or affecting a game", async () => {
    const w = world(); w.store.call.mockResolvedValueOnce(false);
    const limited = await handleTraffic(request(beat), "ip", w); expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
    w.store.call.mockRejectedValueOnce(new Error("secret response")); const failed = await handleTraffic(request(beat), "ip", w);
    expect(failed.status).toBe(503); expect(await failed.text()).toBe(""); expect(failed.headers.get("retry-after")).toBe("300");
  });
});

describe("efficient browser traffic", () => {
  function client(status = 204) {
    let time = NOW.getTime(); const saved = new Map<string, string>();
    const send = vi.fn(async (_event: TrafficEvent) => ({ status }));
    return { send, saved, setTime: (next: number) => { time = next; }, client: createTrafficClient({ send, now: () => time, storage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value); } } }) };
  }
  it("deduplicates StrictMode, reloads and repeated visits per UTC day", async () => {
    const w = client(); await Promise.all([w.client.visit(), w.client.visit()]); await w.client.visit(); expect(w.send).toHaveBeenCalledTimes(1);
    expect(w.saved.get(VISIT_DAY_KEY)).toBe("2026-11-18"); w.setTime(Date.parse("2026-11-19")); await w.client.visit(); expect(w.send).toHaveBeenCalledTimes(2);
  });
  it("coalesces quick mode changes to the latest presence", async () => {
    const w = client(); const first = w.client.presence({ mode: "ai", level: 1, country: null });
    void w.client.presence(null); void w.client.presence({ mode: "two", level: null, country: "PK" }); await first;
    expect(w.send).toHaveBeenCalledTimes(1); expect(w.send).toHaveBeenCalledWith({ action: "beat", mode: "two", level: null, country: "PK" });
  });
  it("serializes an in-flight beat and a later end so a stale beat cannot bring a closed game online", async () => {
    let release!: () => void; const sent: TrafficEvent[] = [];
    const c = createTrafficClient({ now: Date.now, storage: null, send: async (event) => { sent.push(event); if (sent.length === 1) await new Promise<void>((resolve) => { release = resolve; }); return { status: 204 }; } });
    const flight = c.presence({ mode: "ai", level: 4, country: null }); await Promise.resolve(); expect(sent).toHaveLength(1);
    void c.presence(null); release(); await flight; expect(sent.map((event) => event.action)).toEqual(["beat", "end"]);
  });
  it("backs off unavailable analytics instead of calling every 30 seconds", async () => {
    const w = client(503); await w.client.visit(); await w.client.presence({ mode: "ai", level: 1, country: null }); await w.client.visit();
    expect(w.send).toHaveBeenCalledTimes(1); w.setTime(NOW.getTime() + 300001); await w.client.visit(); expect(w.send).toHaveBeenCalledTimes(2);
  });
  it("does not send active presence for finished, abandoned or drawn games", () => {
    const state = { mode: "vs-ai" as const, aiLevel: 4 as const, winner: null, abandoned: false };
    expect(gamePresence(state, "PK")).toEqual({ mode: "ai", level: 4, country: "PK" });
    expect(gamePresence({ ...state, winner: "white" }, null)).toBeNull(); expect(gamePresence({ ...state, abandoned: true }, null)).toBeNull();
    expect(gamePresence({ ...state, drawn: "repetition" }, null)).toBeNull();
  });
});
