// History: the arrows and the move list. Reviewing changes only what is on
// screen, never the game.
import { describe, expect, it } from "vitest";
import { at, boardFrom } from "../engine/testUtils";
import { canHumanAct, createGameState, gameReducer } from "./gameReducer";
import type { GameState, HistoryTarget } from "./gameReducer";
import { canGoBack, canGoForward, displayedPosition, moveList } from "./history";
import { selectablePieces } from "./selectors";

function clicks(state: GameState, ...squares: [number, number][]): GameState {
  return squares.reduce(
    (current, [row, col]) => gameReducer(current, { type: "click", position: at(row, col) }),
    state,
  );
}

const go = (state: GameState, to: HistoryTarget) => gameReducer(state, { type: "history", to });

// Three moves: black, white, black. White then has one move: a capture with
// the piece on (3,0), so that is the piece a human could select.
const played = clicks(createGameState(), [5, 2], [4, 3], [2, 1], [3, 0], [5, 0], [4, 1]);

describe("history entries", () => {
  it("start with just the starting position", () => {
    const state = createGameState();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.move).toBeNull();
    expect(state.viewIndex).toBeNull();
  });

  it("add one entry per move, with the board after it and who moved", () => {
    expect(played.history).toHaveLength(4);
    expect(played.history[1]!.player).toBe("black");
    expect(played.history[2]!.player).toBe("white");
    expect(played.history[3]!.board).toBe(played.board);
  });

  it("are reset by New game", () => {
    const fresh = gameReducer(go(played, "back"), { type: "newGame" });
    expect(fresh.history).toHaveLength(1);
    expect(fresh.viewIndex).toBeNull();
  });
});

describe("arrows", () => {
  it("at the live position: back works, forward is disabled", () => {
    expect(canGoBack(played)).toBe(true);
    expect(canGoForward(played)).toBe(false);
    expect(go(played, "forward")).toBe(played); // nothing to go forward to
    expect(go(played, "last")).toBe(played);
  });

  it("back shows the previous position without changing the game", () => {
    const state = go(played, "back");
    const shown = displayedPosition(state);
    expect(shown.index).toBe(2);
    expect(shown.live).toBe(false);
    expect(shown.board).toBe(played.history[2]!.board);
    expect(shown.previousBoard).toBe(played.history[1]!.board);
    // The game itself is unchanged.
    expect(state.board).toBe(played.board);
    expect(state.currentPlayer).toBe(played.currentPlayer);
    expect(state.movesPlayed).toBe(3);
  });

  it("first goes to the start; back stops there", () => {
    const start = go(played, "first");
    expect(displayedPosition(start).index).toBe(0);
    expect(displayedPosition(start).move).toBeNull();
    expect(canGoBack(start)).toBe(false);
    expect(go(start, "back")).toBe(start);
  });

  it("forward steps towards the live position and becomes disabled there", () => {
    const start = go(played, "first");
    const one = go(start, "forward");
    expect(displayedPosition(one).index).toBe(1);
    const live = go(go(one, "forward"), "forward");
    expect(live.viewIndex).toBeNull();
    expect(canGoForward(live)).toBe(false);
  });

  it("last jumps straight back to the live position", () => {
    expect(go(go(played, "first"), "last").viewIndex).toBeNull();
  });

  it("a move number jumps to that position (the move list)", () => {
    expect(displayedPosition(go(played, 1)).index).toBe(1);
    expect(go(played, 3).viewIndex).toBeNull(); // the latest is live
    expect(displayedPosition(go(played, 99)).index).toBe(3); // clamped
    expect(displayedPosition(go(played, -5)).index).toBe(0);
  });
});

describe("reviewing locks the board", () => {
  const reviewing = go(played, "back");

  it("is not a human turn while an older position is on screen", () => {
    expect(canHumanAct(played)).toBe(true);
    expect(canHumanAct(reviewing)).toBe(false);
  });

  it("ignores clicks and highlights nothing", () => {
    expect(gameReducer(reviewing, { type: "click", position: at(2, 1) })).toBe(reviewing);
    expect(selectablePieces(reviewing)).toEqual([]);
  });

  it("drops any selection when stepping back", () => {
    const selected = clicks(played, [3, 0]);
    expect(selected.selected).not.toBeNull();
    expect(go(selected, "back").selected).toBeNull();
  });

  it("returning to the live position unlocks the board again", () => {
    const live = go(reviewing, "last");
    expect(canHumanAct(live)).toBe(true);
    expect(clicks(live, [3, 0]).selected).toEqual(at(3, 0));
  });
});

describe("AI reply while reviewing", () => {
  it("is added to the history, and the reviewer stays on the position they chose", () => {
    const thinking = clicks(createGameState({ mode: "vs-ai" }), [5, 2], [4, 3]);
    const reviewing = go(thinking, "first");
    const move = thinking.legalMoves[0]!;
    const state = gameReducer(reviewing, { type: "aiMoved", requestId: thinking.aiRequestId, move });

    expect(state.history).toHaveLength(3);
    expect(state.viewIndex).toBe(0);
    expect(canGoForward(state)).toBe(true);
    expect(displayedPosition(go(state, "last")).move).toEqual(move);
  });
});

describe("moveList", () => {
  it("lists every move with its number and side", () => {
    const list = moveList(played);
    expect(list.map((item) => [item.number, item.player])).toEqual([
      [1, "black"],
      [2, "white"],
      [3, "black"],
    ]);
    expect(list[0]!.move.to).toEqual(at(4, 3));
  });

  it("marks a move that made a King", () => {
    const board = boardFrom([
      "........",
      "..b.....",
      "........",
      "........",
      "........",
      "........",
      ".....w..",
      "........",
    ]);
    const state = clicks(createGameState({ board }), [1, 2], [0, 1]);
    expect(moveList(state)[0]!.crowned).toBe(true);
    expect(moveList(played).some((item) => item.crowned)).toBe(false);
  });
});
