// D89: the draw rules (the same position a third time, 40 moves each without
// a capture or a new King) and the AI's resignation when its position is
// proven lost. The game state, what the screen and the reports make of
// them, and the server's checks.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WIN } from "../src/ai/search";
import type { Analyze } from "../src/ai/analyzer";
import { boardFrom } from "../src/engine/testUtils";
import { applyMove, getLegalMoves, opponentOf, samePosition } from "../src/engine";
import type { Board, Position } from "../src/engine";
import { createGameState, gameReducer, isGameOver } from "../src/state/gameReducer";
import type { GameState } from "../src/state/gameReducer";
import { isGameInProgress } from "../src/state/selectors";
import { winReasonOf } from "../src/ui/gameView";
import { ResultDialog } from "../src/ui/ResultDialog";
import { aiMood } from "../src/ui/aiMood";
import { endContext, isSubmittableWin, vsAiOutcomeOf } from "../src/ui/usePersonality";
import { reportedResult } from "../src/ui/leaderboard/useLeaderboardGame";
import { acceptWin, replayWin } from "../netlify/leaderboard/replay";
import { BLACK_WIN } from "./leaderboard/fixtures";

const at = (row: number, col: number): Position => ({ row, col });

// A Black King and a White King in opposite corners: they can only shuffle.
const KINGS: Board = boardFrom([
  ".......W",
  "........",
  "........",
  "........",
  "........",
  "........",
  "........",
  "B.......",
]);

// Plays a move from `from` to `to` by clicking, as a person would.
function click(state: GameState, from: Position, to: Position): GameState {
  return gameReducer(gameReducer(state, { type: "click", position: from }), { type: "click", position: to });
}

const shuffle = (state: GameState) =>
  click(click(click(click(state, at(7, 0), at(6, 1)), at(0, 7), at(1, 6)), at(6, 1), at(7, 0)), at(1, 6), at(0, 7));

describe("the game state: draws", () => {
  it("the same position a third time ends the game in a draw, with no winner", () => {
    const start = createGameState({ board: KINGS });
    const once = shuffle(start);
    expect(once.drawn).toBeNull();
    const twice = shuffle(once);
    expect(twice.drawn).toBe("repetition");
    expect(twice.winner).toBeNull();
    expect(isGameOver(twice)).toBe(true);
    expect(isGameInProgress(twice)).toBe(false);
    expect(twice.legalMoves).toEqual([]);
    // The board is locked: a click does nothing.
    expect(gameReducer(twice, { type: "click", position: at(7, 0) })).toBe(twice);
    expect(winReasonOf(twice)).toBe("Draw: the same position came up three times.");
  });

  it("against the AI the AI does not start thinking after a draw", () => {
    const start = createGameState({ board: KINGS, mode: "vs-ai", humanSide: "black" });
    let state = start;
    // The person plays Black; the AI's replies come in as aiMoved.
    const ai = (s: GameState, from: Position, to: Position) => {
      const move = s.legalMoves.find((m) => samePosition(m.from, from) && samePosition(m.to, to))!;
      return gameReducer(s, { type: "aiMoved", requestId: s.aiRequestId, move });
    };
    for (let round = 0; round < 2; round += 1) {
      state = click(state, at(7, 0), at(6, 1));
      state = ai(state, at(0, 7), at(1, 6));
      state = click(state, at(6, 1), at(7, 0));
      state = ai(state, at(1, 6), at(0, 7));
    }
    expect(state.drawn).toBe("repetition");
    expect(state.aiPhase).toBe("idle");
    expect(endContext(state)).toBe("draw");
    expect(vsAiOutcomeOf(state)).toBe("draw");
    expect(reportedResult(state)).toEqual({ result: "draw", resigned: false });
    expect(isSubmittableWin(state)).toBe(false);
    expect(aiMood(state, 0.5)).toBe("neutral");
  });
});

describe("the game state: the AI resigns", () => {
  const waiting = () => {
    const start = createGameState({ mode: "vs-ai", humanSide: "black" });
    const move = start.legalMoves[0]!;
    return click(start, move.from, move.to); // now the AI is thinking
  };

  it("in answer to its request: the player wins, and the AI is the one who resigned", () => {
    const state = waiting();
    expect(state.aiPhase).toBe("thinking");
    const resigned = gameReducer(state, { type: "aiResigned", requestId: state.aiRequestId });
    expect(resigned.winner).toBe("black");
    expect(resigned.resignedBy).toBe("white");
    expect(resigned.aiPhase).toBe("idle");
    expect(resigned.legalMoves).toEqual([]);
    expect(winReasonOf(resigned)).toBe("The AI resigned: its position was lost.");
    expect(endContext(resigned)).toBe("aiResigned");
    expect(vsAiOutcomeOf(resigned)).toBe("win");
    // The player's win, never flagged as the player's resignation.
    expect(reportedResult(resigned)).toEqual({ result: "win", resigned: false });
    expect(aiMood(resigned, 0.5)).toBe("defeated");
  });

  it("a late or stale answer changes nothing", () => {
    const state = waiting();
    expect(gameReducer(state, { type: "aiResigned", requestId: state.aiRequestId - 1 })).toBe(state);
    const newGame = gameReducer(state, { type: "newGame" });
    expect(gameReducer(newGame, { type: "aiResigned", requestId: state.aiRequestId })).toBe(newGame);
  });

  it("the player's own resignation is still a loss and never counts", () => {
    const state = gameReducer(waiting(), { type: "resign" });
    expect(state.resignedBy).toBe("black");
    expect(reportedResult(state)).toEqual({ result: "loss", resigned: true });
    expect(isSubmittableWin(state)).toBe(false);
  });
});

describe("the result panel", () => {
  it("a draw: a Draw ribbon in bronze, no confetti, nobody marked the winner", () => {
    const html = renderToStaticMarkup(
      createElement(ResultDialog, {
        winner: null,
        mode: "vs-ai",
        aiSide: "white",
        reason: "Draw: the same position came up three times.",
        stats: { black: { moves: 30, captured: 4, kingsMade: 1, bestChain: 1 }, white: { moves: 30, captured: 4, kingsMade: 1, bestChain: 1 } },
        pieces: { black: 8, white: 8 },
        totalMoves: 60,
        durationMs: 120_000,
        onPlayAgain: () => {},
        onReview: () => {},
        onClose: () => {},
      }),
    );
    expect(html).toContain('class="result result-draw"');
    expect(html).toMatch(/class="result-title result-title-draw">Draw</);
    expect(html).not.toContain("confetti");
    expect(html).not.toContain("result-col-winner");
  });
});

describe("the server's checks", () => {
  // A fake proof: every move of the side asked about loses (or not).
  const proof = (lost: boolean): Analyze => async (board, player, depth) => ({
    depth,
    scores: getLegalMoves(board, player).map(() => (lost ? -(WIN - 2) : 0)),
  });

  it("a game that is not over counts only as the AI's resignation of a proven lost game", async () => {
    const beforeEnd = BLACK_WIN.slice(0, -2); // White (the AI) to move
    expect(replayWin(beforeEnd, "black")).toEqual({ ok: false, reason: "incomplete" });
    const accepted = await acceptWin(beforeEnd, "black", proof(true));
    expect(accepted).toMatchObject({ ok: true, resigned: true });
    expect(await acceptWin(beforeEnd, "black", proof(false))).toEqual({ ok: false, reason: "incomplete" });
  });

  it("never when the player is to move (the player cannot claim the AI resigned on their own turn)", async () => {
    const playerToMove = BLACK_WIN.slice(0, -1);
    expect(await acceptWin(playerToMove, "black", proof(true))).toEqual({ ok: false, reason: "incomplete" });
  });

  it("a finished win still counts as before", async () => {
    expect(await acceptWin(BLACK_WIN, "black", proof(false))).toMatchObject({ ok: true, moveCount: Math.ceil(BLACK_WIN.length / 2) });
  });
});

describe("the AI's move board for these tests", () => {
  it("the two Kings can only shuffle (no captures, no crowning)", () => {
    for (const player of ["black", "white"] as const) {
      for (const move of getLegalMoves(KINGS, player)) expect(move.captured).toEqual([]);
    }
    expect(opponentOf("black")).toBe("white");
    expect(applyMove(KINGS, getLegalMoves(KINGS, "black")[0]!)).not.toEqual(KINGS);
  });
});

describe("the development links (?scenario=draw and ?scenario=airesign)", () => {
  it("draw: one more move, White's King back to H8, makes it a draw", async () => {
    const { scenario } = await import("../src/ui/devScenarios");
    const { playRecord } = await import("../src/state/playRecord");
    const options = scenario("draw")!;
    const ready = playRecord(createGameState(options), options.record ?? []);
    expect(ready.drawn).toBeNull();
    expect(ready.currentPlayer).toBe("white");
    const drawn = click(ready, at(1, 6), at(0, 7));
    expect(drawn.drawn).toBe("repetition");
  });

  it("airesign: after the player's quiet move the AI is proven lost, so it resigns", async () => {
    const { scenario } = await import("../src/ui/devScenarios");
    const { provenLost } = await import("../src/ai/endgame");
    const start = createGameState(scenario("airesign")!);
    const moved = click(start, at(7, 6), at(6, 5)); // G1 to F2
    expect(moved.aiPhase).toBe("thinking");
    expect(await provenLost(moved.board, "white")).toBe(true);
  });
});
