// Difficulty levels end to end inside the AI module: the prompt carries the
// engine's scores, a broken look-ahead never stops a turn, and no prompt can
// grow past what the server accepts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_PROMPT_CHARS } from "../../netlify/aiMoveHandler";
import { applyMove, getLegalMoves, initialBoard, opponentOf } from "../engine";
import type { Board, Player } from "../engine";
import { FALLBACK_DEPTH, analyze, analyzeHere } from "./analyzer";
import type { Analyze } from "./analyzer";
import { chooseMove } from "./chooseMove";
import type { CallModel } from "./chooseMove";
import { AI_LEVELS, DEFAULT_AI_LEVEL, LEVELS, toAiLevel } from "./difficulty";
import { buildPrompt, describeScore } from "./prompt";
import { WIN } from "./search";

const board = initialBoard();
const legal = getLegalMoves(board, "black"); // 7 moves

function recordingModel(reply: string) {
  const prompts: string[] = [];
  const callModel: CallModel = async (prompt) => {
    prompts.push(prompt);
    return reply;
  };
  return { callModel, prompts };
}

describe("levels", () => {
  it("go from no look-ahead to 6 turns", () => {
    expect(LEVELS.map((level) => AI_LEVELS[level].depth)).toEqual([0, 2, 4, 6]);
    expect(AI_LEVELS[4].name).toBe("Expert");
  });

  it("turn any stored value into a valid level", () => {
    expect(toAiLevel(3)).toBe(3);
    expect(toAiLevel("4")).toBe(4);
    for (const bad of [0, 5, "x", null, undefined, 2.5]) expect(toAiLevel(bad)).toBe(DEFAULT_AI_LEVEL);
  });
});

describe("describeScore", () => {
  it("writes material in pieces with a sign", () => {
    expect(describeScore(100)).toBe("+1.0");
    expect(describeScore(-60)).toBe("-0.6");
    expect(describeScore(0)).toBe("0.0");
    expect(describeScore(-0)).toBe("0.0");
  });

  it("writes forced results in turns", () => {
    expect(describeScore(WIN - 1)).toBe("wins the game at once");
    expect(describeScore(WIN - 3)).toBe("forced win in 3 turns");
    expect(describeScore(-(WIN - 4))).toBe("forced loss in 4 turns");
  });
});

describe("buildPrompt with a look-ahead", () => {
  const scores = [100, -60, 0, 0, WIN - 3, 0, -(WIN - 2)];
  const prompt = buildPrompt(board, "black", legal, { depth: 4, scores });

  it("explains the look-ahead and its depth", () => {
    expect(prompt).toContain("Engine look-ahead");
    expect(prompt).toContain("for the next 4 turns");
    expect(prompt).toContain("Choose the move with the highest score");
  });

  it("puts each move's score on its line", () => {
    expect(prompt).toContain("1: A3 -> B4 | score +1.0");
    expect(prompt).toContain("2: ");
    expect(prompt).toMatch(/2: .* \| score -0\.6/);
    expect(prompt).toMatch(/5: .* \| forced win in 3 turns/);
    expect(prompt).toMatch(/7: .* \| forced loss in 2 turns/);
  });

  it("ignores scores that do not match the move list", () => {
    const plain = buildPrompt(board, "black", legal);
    expect(buildPrompt(board, "black", legal, { depth: 4, scores: [1, 2] })).toBe(plain);
    expect(plain).not.toContain("score");
  });

  it("stays under the server's size limit at every level, even in busy positions", () => {
    let position: Board = initialBoard();
    let player: Player = "black";
    let longest = 0;
    for (let turn = 0; turn < 60; turn++) {
      const moves = getLegalMoves(position, player);
      if (moves.length === 0) break;
      // Worst case for length: the longest score text on every line.
      const worst = { depth: 6, scores: moves.map(() => -(WIN - 12)) };
      longest = Math.max(longest, buildPrompt(position, player, moves, worst).length);
      position = applyMove(position, moves[turn % moves.length]!);
      player = opponentOf(player);
    }
    expect(longest).toBeLessThan(MAX_PROMPT_CHARS);
  });
});

describe("chooseMove at each level", () => {
  it("Beginner: no look-ahead is run and the prompt has no scores", async () => {
    const analyzeSpy = vi.fn<Analyze>();
    const { callModel, prompts } = recordingModel('{"move": 1}');
    const result = await chooseMove(board, "black", callModel, 3, { level: 1, analyze: analyzeSpy });

    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(prompts[0]).not.toContain("score");
    expect(result).toEqual({ ok: true, move: legal[0], attempts: 1 });
  });

  it.each([2, 3, 4] as const)("level %i: asks for that depth, sends the scores, reports the chosen score", async (level) => {
    const depths: number[] = [];
    const fake: Analyze = async (_b, _p, depth) => {
      depths.push(depth);
      return { depth, scores: [0, 50, 200, 0, 0, 0, -100] };
    };
    const { callModel, prompts } = recordingModel('{"move": 2, "reason": "Solid."}');
    const result = await chooseMove(board, "black", callModel, 3, { level, analyze: fake });

    expect(depths).toEqual([AI_LEVELS[level].depth]);
    expect(prompts[0]).toContain(`for the next ${AI_LEVELS[level].depth} turns`);
    expect(prompts[0]).toMatch(/3: .* \| score \+2\.0/);
    expect(result).toEqual({
      ok: true,
      move: legal[1],
      attempts: 1,
      reason: "Solid.",
      lookahead: { depth: AI_LEVELS[level].depth, score: 50, best: 200 },
    });
  });

  it("still plays when the look-ahead throws (the model just gets no scores)", async () => {
    const broken: Analyze = async () => {
      throw new Error("worker crashed");
    };
    const { callModel, prompts } = recordingModel('{"move": 3}');
    const result = await chooseMove(board, "black", callModel, 3, { level: 4, analyze: broken });

    expect(result).toEqual({ ok: true, move: legal[2], attempts: 1 });
    expect(prompts[0]).not.toContain("Engine look-ahead");
  });

  it.each([
    ["the wrong number of scores", { depth: 4, scores: [1, 2, 3] }],
    ["a score that is not a number", { depth: 4, scores: [0, 0, Number.NaN, 0, 0, 0, 0] }],
  ])("ignores a look-ahead with %s", async (_, bad) => {
    const { callModel, prompts } = recordingModel('{"move": 1}');
    const result = await chooseMove(board, "black", callModel, 3, { level: 3, analyze: async () => bad });
    expect(result.ok).toBe(true);
    expect(prompts[0]).not.toContain("Engine look-ahead");
  });

  it("uses the real search on the page by default", async () => {
    const { callModel, prompts } = recordingModel('{"move": 1}');
    const result = await chooseMove(board, "black", callModel, 3, { level: 2 });
    expect(prompts[0]).toContain("for the next 2 turns");
    expect(result.ok && result.lookahead?.depth).toBe(2);
  });
});

describe("analyze (the app's analyzer)", () => {
  const realWorker = globalThis.Worker;
  afterEach(() => {
    globalThis.Worker = realWorker;
  });

  it("without Web Workers (as in these tests), searches on the page at full depth", async () => {
    expect(await analyze(board, "black", 3)).toEqual(await analyzeHere(board, "black", 3));
  });

  it("falls back to a quick search when the worker fails", async () => {
    class FailingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      postMessage() {
        setTimeout(() => this.onerror?.(new Event("error")), 0);
      }
      terminate() {}
    }
    globalThis.Worker = FailingWorker as unknown as typeof Worker;

    const result = await analyze(board, "black", 6);
    expect(result.depth).toBe(FALLBACK_DEPTH);
    expect(result).toEqual(await analyzeHere(board, "black", FALLBACK_DEPTH));
  });

  it("uses the worker's scores when it answers", async () => {
    class GoodWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      postMessage() {
        setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: [5, 4, 3, 2, 1, 0, -1] })), 0);
      }
      terminate() {}
    }
    globalThis.Worker = GoodWorker as unknown as typeof Worker;
    expect(await analyze(board, "black", 6)).toEqual({ depth: 6, scores: [5, 4, 3, 2, 1, 0, -1] });
  });
});
