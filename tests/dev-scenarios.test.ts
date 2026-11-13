// The dev preview scenarios must really be one move from the end, or the
// instructions for checking the result popup would be wrong.
import { describe, expect, it } from "vitest";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameState } from "../src/state/gameReducer";
import { scenario } from "../src/ui/devScenarios";

// Clicks written the way a person reads the board: row 1 is the top.
function clicks(state: GameState, ...cells: [number, number][]): GameState {
  return cells.reduce(
    (s, [row, col]) => gameReducer(s, { type: "click", position: { row: row - 1, col: col - 1 } }),
    state,
  );
}

describe("dev scenarios", () => {
  it("win: one double jump (row 8 col 3 to row 4 col 7) wins against the AI", () => {
    const state = clicks(createGameState(scenario("win")), [8, 3], [4, 7]);
    expect(state.mode).toBe("vs-ai");
    expect(state.winner).toBe("black");
    expect(state.stats.black.bestChain).toBe(2);
  });

  it("lose: after row 6 col 3 to row 5 col 4, the AI's only move captures the last black piece", () => {
    const waiting = clicks(createGameState(scenario("lose")), [6, 3], [5, 4]);
    expect(waiting.aiPhase).toBe("thinking");
    expect(waiting.legalMoves).toHaveLength(1);

    const aiMove = waiting.legalMoves[0]!;
    const state = gameReducer(waiting, { type: "aiMoved", requestId: waiting.aiRequestId, move: aiMove });
    expect(state.winner).toBe("white");
  });

  it("duel: the same double jump wins a two-player game for Black", () => {
    const state = clicks(createGameState(scenario("duel")), [8, 3], [4, 7]);
    expect(state.mode).toBe("two-player");
    expect(state.winner).toBe("black");
  });

  it("an unknown name gives the normal game", () => {
    expect(scenario("nope")).toBeUndefined();
  });
});

describe("react scenario", () => {
  it("E3 -> D4 (row 6 col 5 to row 5 col 4) is a blunder the engine spots", async () => {
    const { judgeMove } = await import("../src/ai/judge");
    const start = createGameState(scenario("react"));
    const after = clicks(start, [6, 5], [5, 4]);
    expect(after.aiPhase).toBe("thinking");
    const judgement = await judgeMove(start.board, after.history.at(-1)!.move!, "black");
    expect(judgement?.verdict).toBe("blunder");
  });

  it("react-strong is the same position at Strongest (D45)", () => {
    expect(scenario("react-strong")).toEqual({ ...scenario("react"), aiLevel: 4 });
  });
});
