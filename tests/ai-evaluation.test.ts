import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyMove, getLegalMoves, initialBoard, opponentOf } from "../src/engine";
import type { Player } from "../src/engine";
import { AI_LEVELS } from "../src/ai/difficulty";
import { chooseMove } from "../src/ai/chooseMove";
import { EngineFallbackError, promptForContext } from "../src/ai/request";
import { checkedReasons, reasonPasses } from "../src/ai/truth";
import { FREE_PROVIDERS } from "../netlify/ai/providers";
import { aggregateMeasurement, buildCases, CATEGORIES, capacityReport, evaluateProvider, evaluationReport, generatePositions, scheduleCases } from "../scripts/eval-ai-models";
import type { EvalCase, EvalPosition } from "../scripts/eval-ai-models";
let positions: EvalPosition[], cases: EvalCase[];
beforeAll(() => { positions = generatePositions(); cases = buildCases(positions); }, 30000);
describe("repeatable real positions and evaluation", () => {
  it("replays all 42 boards from the initial position and covers every category at every level", () => {
    expect(positions).toEqual(generatePositions());
    expect(positions).toHaveLength(42);
    for (const category of CATEGORIES) expect(positions.filter(p => p.category === category)).toHaveLength(7);
    for (const p of positions) {
      let board = initialBoard(), player: Player = "black";
      for (const index of p.replay) {
        const move = getLegalMoves(board, player)[index];
        expect(move).toBeDefined();
        board = applyMove(board, move!); player = opponentOf(player);
      }
      expect(board).toEqual(p.board); expect(player).toBe(p.player);
    }
    for (const level of [1, 2, 3, 4]) expect(cases.filter(c => c.context.level === level && c.context.job === "move")).toHaveLength(42);
    expect(cases.every(c => c.prompt === promptForContext(c.context))).toBe(true);
  });
  it("engine fallback always plays the best legal move at each real position and level", async () => {
    for (const c of cases.filter(c => c.context.job === "move")) {
      const legal = getLegalMoves(c.context.board, c.context.player);
      const result = await chooseMove(c.context.board, c.context.player, async () => { throw new EngineFallbackError(); }, 0, {
        level: c.context.level, engineFallback: true,
        analyze: async () => ({ depth: AI_LEVELS[c.context.level].depth, scores: c.scores }), random: () => 0,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const index = legal.findIndex(move => JSON.stringify(move) === JSON.stringify(result.move));
        expect(index).toBeGreaterThanOrEqual(0);
        expect(c.scores[index]).toBe(Math.max(...c.scores));
        expect(result.lookahead?.source).toBe("engine");
      }
    }
  });
  it("interleaves categories and taunts without losing or repeating any case", () => {
    const scheduled = scheduleCases(cases);
    expect(new Set(scheduled.map(c => c.id))).toEqual(new Set(cases.map(c => c.id)));
    expect(scheduled.slice(0, 30).filter(c => c.context.job === "taunt")).toHaveLength(6);
    for (const category of CATEGORIES) expect(scheduled.slice(0, 30).filter(c => c.id.includes(`-${category}-level-`))).toHaveLength(4);
  });
  it("counts archived requests after a fixture change instead of granting a fresh daily quota", async () => {
    const p = { ...FREE_PROVIDERS[0]!, rpd: 1 };
    const send = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"move":1}' } }] })));
    const first = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(0, 1), { fetch: send, now: () => 1000 });
    expect(first.complete).toBe(true);
    const second = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(1, 2), { fetch: send, quotaHistory: first.samples, now: () => 2000 });
    expect(second).toMatchObject({ complete: false, stoppedCode: "DAILY_SAFETY_STOP", samples: [] });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("counts thinking tokens even when a truncated or invalid answer is rejected", async () => {
    const p = FREE_PROVIDERS[0]!;
    const send = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }], usage: { prompt_tokens: 500, completion_tokens: 768, total_tokens: 1268, completion_tokens_details: { reasoning_tokens: 768 } } })));
    const result = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(0, 1), { fetch: send });
    expect(result.samples[0]).toMatchObject({ valid: false, code: "INVALID_REPLY", usage: { reasoning: 768, total: 1268 } });
    expect(aggregateMeasurement(result).averageTokens).toBe(1268);
  });
  it.each(FREE_PROVIDERS)("$id stops on a limit response without leaking secrets", async p => {
    const logs: unknown[] = [];
    const secret = "not-a-real-key-must-not-appear";
    const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 429, message: secret } }), { status: 429, headers: { "retry-after": "7" } }));
    const result = await evaluateProvider(p, { [p.keyEnv]: secret }, cases, { fetch: send, now: () => 1000, log: e => logs.push(e), sleep: async () => {} });
    expect(result).toMatchObject({ complete: false, stoppedCode: "429", retryAt: 8000, samples: [] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(logs).toEqual([{ provider: p.id, code: "429", count: 0 }]);
    expect(JSON.stringify(result) + JSON.stringify(logs)).not.toContain(secret);
  });
  it("spaces calls using both request and token throughput; records tokens without double counting thinking", async () => {
    let time = 1000;
    const times: number[] = [];
    const p = { ...FREE_PROVIDERS[0]!, rpm: 30, tpm: 1000 };
    const send = vi.fn(async () => {
      times.push(time);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"move":1,"reason":"The moved piece cannot be captured next turn."}' } }], usage: { prompt_tokens: 600, completion_tokens: 100, total_tokens: 700, completion_tokens_details: { reasoning_tokens: 50 } } }));
    });
    const result = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(0, 2), { fetch: send, now: () => time, sleep: async ms => { time += ms; } });
    expect(result.complete).toBe(true);
    expect(times[1]! - times[0]!).toBeGreaterThan(60000);
    expect(aggregateMeasurement(result).averageTokens).toBe(700);
    expect(result.samples[0]?.usage?.reasoning).toBe(50);
  });
  it("resumes a daily-limited provider on the next day without redoing cases or resetting lifetime counters", async () => {
    const p = { ...FREE_PROVIDERS[0]!, rpd: 2 };
    let time = 1000;
    const send = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"move":1}' } }] })));
    const deps = { fetch: send, now: () => time, sleep: async (ms: number) => { time += ms; } };
    const first = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(0, 4), deps);
    expect(first).toMatchObject({ complete: false, stoppedCode: "DAILY_SAFETY_STOP" });
    expect(first.samples).toHaveLength(2);
    time = first.retryAt! + 1;
    const second = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(0, 4), { ...deps, prior: first });
    expect(second.complete).toBe(true);
    expect(second.samples).toHaveLength(4);
    expect(send).toHaveBeenCalledTimes(4);
  });
  it("preserves minute pacing when resuming a checkpoint or changed fixtures", async () => {
    const p = { ...FREE_PROVIDERS[0]!, rpm: 1, tpm: 100000 };
    let time = 1000;
    const times: number[] = [];
    const send = vi.fn(async () => { times.push(time); return new Response(JSON.stringify({ choices: [{ message: { content: '{"move":1}' } }] })); });
    const deps = { fetch: send, now: () => time, sleep: async (ms: number) => { time += ms; } };
    const first = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(0, 1), deps);
    const second = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(0, 2), { ...deps, prior: first });
    expect(second.complete).toBe(true);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(66000);
    await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(2, 3), { ...deps, quotaHistory: second.samples });
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(66000);
    expect(send).toHaveBeenCalledTimes(3);
  });
  it.each([
    ["utc-day", "2026-11-17T23:59:59Z", "2026-11-18T00:00:00Z"],
    ["pacific-day", "2026-11-01T07:00:01Z", "2026-11-02T08:00:00Z"],
  ] as const)("resumes %s quotas at the documented midnight including DST", async (reset, start, midnight) => {
    const p = { ...FREE_PROVIDERS[0]!, reset, rpd: 1 };
    let time = Date.parse(start);
    const send = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"move":1}' } }] })));
    const deps = { fetch: send, now: () => time, sleep: async (ms: number) => { time += ms; } };
    const first = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(0, 2), deps);
    expect(first).toMatchObject({ complete: false, stoppedCode: "DAILY_SAFETY_STOP", retryAt: Date.parse(midnight) });
    time = Date.parse(midnight) + 1;
    // Retain compatibility with checkpoints created before calendar accounting.
    const second = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases.slice(0, 2), { ...deps, prior: { ...first, retryAt: time + 86400000 } });
    expect(second.complete).toBe(true);
    expect(second.samples).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("stops a transport outage, keeps its checkpoint, and never logs exception text", async () => {
    const p = FREE_PROVIDERS[0]!;
    const send = vi.fn(async () => { throw new Error("private-key-and-player-name"); });
    const logs: unknown[] = [];
    const result = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases, { fetch: send, sleep: async () => {}, now: () => 1000, log: e => logs.push(e) });
    expect(result).toMatchObject({ complete: false, stoppedCode: "TRANSPORT_UNAVAILABLE" });
    expect(send).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(logs)).not.toContain("private-key-and-player-name");
    const resumed = await evaluateProvider(p, { [p.keyEnv]: "secret" }, cases, { fetch: send, prior: result, now: () => 1001 });
    expect(resumed.samples).toHaveLength(3); expect(send).toHaveBeenCalledTimes(3);
  });
  it("marks missing keys unmeasured and does not invent scores or capacity", async () => {
    const p = FREE_PROVIDERS[0]!;
    const send = vi.fn();
    const result = await evaluateProvider(p, {}, cases, { fetch: send });
    expect(result).toMatchObject({ complete: false, stoppedCode: "MISSING_KEY", samples: [] });
    expect(send).not.toHaveBeenCalled();
    const report = evaluationReport("2026-11-17", FREE_PROVIDERS, [], cases) + capacityReport(FREE_PROVIDERS, [], cases);
    expect(report).toContain("not measured rankings");
    expect(report).toContain("unknown until eligible keyed models produce usage samples");
  });
  it("counts only exact proven statements as truth, including contradictory capture claims", () => {
    const p = positions.find(p => p.category === "capture")!;
    const move = getLegalMoves(p.board, p.player)[0]!;
    const facts = checkedReasons(p.board, move, p.player, 1);
    expect(reasonPasses(`It captured ${move.captured.length} ${move.captured.length === 1 ? "piece" : "pieces"}.`, facts)).toBe(true);
    expect(reasonPasses("It captured 99 pieces.", facts)).toBe(false);
    expect(reasonPasses("This is strategically brilliant.", facts)).toBe(false);
  });
  it("reports measured capacity only for complete usage and counts a shared quota once", () => {
    const provider = { ...FREE_PROVIDERS[0]!, rpd: 1000, tpd: 100000 };
    const sample = { startedAt: 0, caseId: "move", job: "move" as const, valid: true, top: true, best: true, truth: true, taunt: false, elapsedMs: 100, promptBytes: 300, replyBytes: 20, usage: { input: 100, output: 100, reasoning: 80, total: 200 } };
    const samples = Array.from({ length: 20 }, (_, index) => [
      { ...sample, caseId: `move-${index}` },
      { ...sample, caseId: `taunt-${index}`, job: "taunt" as const },
    ]).flat();
    const result = { id: provider.id, model: provider.model, complete: true, samples };
    const sibling = { ...provider, id: "sibling" };
    const report = capacityReport([provider, sibling], [result, { ...result, id: sibling.id }], cases);
    // 100000 / (30 * 200) = 16; with 32 taunts, floor(100000 / 12400) = 8.
    expect(report).toContain("**16 move only games/day**");
    expect(report).toContain("**8 games/day with 32 standalone taunts**");
    expect(report).toContain("**8/day** for 30 moves plus 32 standalone taunts");
    const heavy = { ...sibling, tier: "quality" as const };
    const heavyResult = { ...result, id: heavy.id, samples: result.samples.map(s => ({ ...s, usage: { input: 200, output: 200, reasoning: 160, total: 400 } })) };
    const weakResult = { ...result, samples: result.samples.map(s => ({ ...s, best: false, truth: false })) };
    expect(capacityReport([provider, heavy], [weakResult, heavyResult], cases)).toContain("quality moves instead gives **8 move only games/day**");
    expect(capacityReport([provider], [{ ...result, complete: false }], cases)).not.toContain("Complete benchmarks with full move and taunt usage coverage");
    expect(capacityReport([provider], [{ ...result, samples: [sample, { ...sample, job: "taunt", usage: null }] }], cases)).not.toContain("Complete benchmarks with full move and taunt usage coverage");
  });
});
