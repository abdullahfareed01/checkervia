// AI mode in the reducer: mode switching, the lock while the AI is thinking,
// the fallback and Retry, and ignoring stale replies. No network involved.
import { describe, expect, it } from "vitest";
import { getLegalMoves, pieceAt } from "../engine";
import { at, boardFrom } from "../engine/testUtils";
import { canHumanAct, createGameState, gameReducer } from "./gameReducer";
import type { GameAction, GameState } from "./gameReducer";
import { isCaptureMandatory, mustCapturePieces, selectablePieces } from "./selectors";

function click(state: GameState, row: number, col: number): GameState {
  return gameReducer(state, { type: "click", position: at(row, col) });
}

function clicks(state: GameState, ...squares: [number, number][]): GameState {
  return squares.reduce((current, [row, col]) => click(current, row, col), state);
}

function send(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce((current, action) => gameReducer(current, action), state);
}

// A vs-AI game where the human (black) has just played, so the AI is thinking.
function thinkingState(): GameState {
  return clicks(createGameState({ mode: "vs-ai" }), [5, 2], [4, 3]);
}

describe("mode", () => {
  it("setMode starts a fresh game in the new mode, black to move", () => {
    const state = gameReducer(createGameState(), { type: "setMode", mode: "vs-ai" });

    expect(state.mode).toBe("vs-ai");
    expect(state.currentPlayer).toBe("black");
    expect(state.aiPhase).toBe("idle");
    expect(state.movesPlayed).toBe(0);
  });

  it("setMode discards a game in progress", () => {
    const played = clicks(createGameState(), [5, 2], [4, 3]);
    const state = gameReducer(played, { type: "setMode", mode: "vs-ai" });
    expect(state.movesPlayed).toBe(0);
    expect(state.currentPlayer).toBe("black");
  });

  it("setMode to the current mode changes nothing", () => {
    const played = clicks(createGameState(), [5, 2], [4, 3]);
    expect(gameReducer(played, { type: "setMode", mode: "two-player" })).toBe(played);
  });

  it("in two-player mode the AI never starts thinking", () => {
    const state = clicks(createGameState(), [5, 2], [4, 3]);
    expect(state.currentPlayer).toBe("white");
    expect(state.aiPhase).toBe("idle");
    expect(canHumanAct(state)).toBe(true);
  });
});

describe("the AI's turn starts after the human's move", () => {
  it("goes to thinking with a new request id", () => {
    const before = createGameState({ mode: "vs-ai" });
    const state = thinkingState();

    expect(state.currentPlayer).toBe("white");
    expect(state.aiPhase).toBe("thinking");
    expect(state.aiRequestId).toBe(before.aiRequestId + 1);
  });

  it("the human still plays black first", () => {
    const state = createGameState({ mode: "vs-ai" });
    expect(canHumanAct(state)).toBe(true);
    expect(click(state, 5, 2).selected).toEqual(at(5, 2));
  });
});

describe("lock while the AI is thinking", () => {
  const state = thinkingState();

  it("ignores every board click", () => {
    expect(click(state, 2, 1)).toBe(state); // a white piece
    expect(click(state, 4, 3)).toBe(state); // the black piece just moved
    expect(click(state, 3, 0)).toBe(state); // an empty square
    expect(click(state, 0, 0)).toBe(state); // a light square
  });

  it("is not a human turn", () => {
    expect(canHumanAct(state)).toBe(false);
  });

  it("highlights nothing, even if the AI has a capture", () => {
    // Black (5,2) steps to (4,3); white (3,4) can then capture it.
    const board = boardFrom([
      "........",
      "........",
      "........",
      "....w...",
      "........",
      "..b.....",
      "........",
      "........",
    ]);
    const thinking = clicks(createGameState({ mode: "vs-ai", board }), [5, 2], [4, 3]);

    expect(thinking.legalMoves.some((m) => m.captured.length > 0)).toBe(true);
    expect(selectablePieces(thinking)).toEqual([]);
    expect(mustCapturePieces(thinking)).toEqual([]);
    expect(isCaptureMandatory(thinking)).toBe(false);
  });
});

describe("the AI's move", () => {
  const thinking = thinkingState();
  const aiMove = thinking.legalMoves[0]!;

  it("is played through the same path as a human move", () => {
    const state = gameReducer(thinking, { type: "aiMoved", requestId: thinking.aiRequestId, move: aiMove });

    expect(state.currentPlayer).toBe("black");
    expect(state.aiPhase).toBe("idle");
    expect(state.movesPlayed).toBe(2);
    expect(state.lastMove).toEqual(aiMove);
    expect(pieceAt(state.board, aiMove.to)?.player).toBe("white");
    expect(canHumanAct(state)).toBe(true);
  });

  it("keeps the model's reason in the history entry of that move", () => {
    const state = gameReducer(thinking, {
      type: "aiMoved",
      requestId: thinking.aiRequestId,
      move: aiMove,
      reason: "Develops a piece.",
    });
    expect(state.history.at(-1)!.reason).toBe("Develops a piece.");
    expect(state.history.at(-2)!.reason).toBeUndefined(); // the human move
  });

  it("stores no reason when the model gave none", () => {
    const state = gameReducer(thinking, { type: "aiMoved", requestId: thinking.aiRequestId, move: aiMove, reason: null });
    expect(state.history.at(-1)).not.toHaveProperty("reason");
  });

  it("gives the same board as a human playing that move in two-player mode", () => {
    const aiState = gameReducer(thinking, { type: "aiMoved", requestId: thinking.aiRequestId, move: aiMove });
    const humanState = clicks(
      createGameState(),
      [5, 2],
      [4, 3],
      [aiMove.from.row, aiMove.from.col],
      [aiMove.to.row, aiMove.to.col],
    );
    expect(aiState.board).toEqual(humanState.board);
    expect(aiState.legalMoves).toEqual(humanState.legalMoves);
  });

  it("is accepted even as a different object, if it equals a legal move", () => {
    const copy = JSON.parse(JSON.stringify(aiMove));
    const state = gameReducer(thinking, { type: "aiMoved", requestId: thinking.aiRequestId, move: copy });
    expect(state.movesPlayed).toBe(2);
  });

  it("is refused if it is not a legal move: the AI fails, nothing is played", () => {
    const illegal = { from: at(0, 1), to: at(5, 5), path: [at(5, 5)], captured: [] };
    const state = gameReducer(thinking, { type: "aiMoved", requestId: thinking.aiRequestId, move: illegal });

    expect(state.aiPhase).toBe("failed");
    expect(state.movesPlayed).toBe(1);
    expect(state.board).toBe(thinking.board);
    expect(state.aiFailureReasons[0]).toContain("not legal");
  });

  it("is ignored if it answers an old request", () => {
    const state = gameReducer(thinking, { type: "aiMoved", requestId: thinking.aiRequestId - 1, move: aiMove });
    expect(state).toBe(thinking);
  });

  it("is ignored if the AI is not thinking", () => {
    const idle = createGameState({ mode: "vs-ai" });
    const state = gameReducer(idle, { type: "aiMoved", requestId: idle.aiRequestId, move: aiMove });
    expect(state).toBe(idle);
  });

  it("can win the game: the winner is announced and the AI stops thinking", () => {
    // Black's only piece steps next to white (3,4), which then captures it.
    const board = boardFrom([
      "........",
      "........",
      "........",
      "....w...",
      "........",
      "..b.....",
      "........",
      "........",
    ]);
    const waiting = clicks(createGameState({ mode: "vs-ai", board }), [5, 2], [4, 3]);
    const capture = waiting.legalMoves[0]!;
    const state = gameReducer(waiting, { type: "aiMoved", requestId: waiting.aiRequestId, move: capture });

    expect(state.winner).toBe("white");
    expect(state.aiPhase).toBe("idle");
    expect(canHumanAct(state)).toBe(false); // locked because the game is over
  });
});

describe("when the AI fails", () => {
  const thinking = thinkingState();
  const failed = gameReducer(thinking, {
    type: "aiFailed",
    requestId: thinking.aiRequestId,
    reasons: ["reason one", "reason two"],
  });

  it("keeps the reasons, plays no move, and leaves the board as it was", () => {
    expect(failed.aiPhase).toBe("failed");
    expect(failed.aiFailureReasons).toEqual(["reason one", "reason two"]);
    expect(failed.board).toBe(thinking.board);
    expect(failed.movesPlayed).toBe(1);
    expect(failed.currentPlayer).toBe("white");
  });

  it("keeps the board locked", () => {
    expect(canHumanAct(failed)).toBe(false);
    expect(click(failed, 2, 1)).toBe(failed);
    expect(selectablePieces(failed)).toEqual([]);
  });

  it("ignores a failure that belongs to an old request", () => {
    const state = gameReducer(thinking, { type: "aiFailed", requestId: 0, reasons: ["old"] });
    expect(state).toBe(thinking);
  });
});

describe("Retry", () => {
  const thinking = thinkingState();
  const failed = gameReducer(thinking, { type: "aiFailed", requestId: thinking.aiRequestId, reasons: ["x"] });

  it("asks the AI again under a new request id and clears the failure", () => {
    const retrying = gameReducer(failed, { type: "aiRetry" });

    expect(retrying.aiPhase).toBe("thinking");
    expect(retrying.aiRequestId).toBe(failed.aiRequestId + 1);
    expect(retrying.aiFailureReasons).toEqual([]);
    expect(retrying.board).toBe(failed.board);
  });

  it("does nothing unless the AI has failed", () => {
    expect(gameReducer(thinking, { type: "aiRetry" })).toBe(thinking);
    const idle = createGameState({ mode: "vs-ai" });
    expect(gameReducer(idle, { type: "aiRetry" })).toBe(idle);
  });

  it("a reply to the failed request no longer counts, a reply to the retry does", () => {
    const retrying = gameReducer(failed, { type: "aiRetry" });
    const move = retrying.legalMoves[0]!;

    const lateOld = gameReducer(retrying, { type: "aiMoved", requestId: failed.aiRequestId, move });
    expect(lateOld).toBe(retrying);

    const fresh = gameReducer(retrying, { type: "aiMoved", requestId: retrying.aiRequestId, move });
    expect(fresh.movesPlayed).toBe(2);
  });

  it("can fail and be retried more than once", () => {
    const again = send(
      failed,
      { type: "aiRetry" },
      { type: "aiFailed", requestId: failed.aiRequestId + 1, reasons: ["again"] },
      { type: "aiRetry" },
    );
    expect(again.aiPhase).toBe("thinking");
    expect(again.aiRequestId).toBe(failed.aiRequestId + 2);
  });

  it("New game still works from a failed state", () => {
    const fresh = gameReducer(failed, { type: "newGame" });
    expect(fresh.aiPhase).toBe("idle");
    expect(fresh.movesPlayed).toBe(0);
    expect(fresh.mode).toBe("vs-ai");
    expect(canHumanAct(fresh)).toBe(true);
  });
});

describe("stale replies are ignored", () => {
  const thinking = thinkingState();
  const lateMove = thinking.legalMoves[0]!;
  const lateReply: GameAction = { type: "aiMoved", requestId: thinking.aiRequestId, move: lateMove };

  it("a reply arriving after New game does not touch the new game", () => {
    const fresh = gameReducer(thinking, { type: "newGame" });
    const afterLateReply = gameReducer(fresh, lateReply);

    expect(afterLateReply).toBe(fresh);
    expect(afterLateReply.movesPlayed).toBe(0);
    expect(afterLateReply.currentPlayer).toBe("black");
  });

  it("a reply arriving after a mode change does not touch the new game", () => {
    const fresh = gameReducer(thinking, { type: "setMode", mode: "two-player" });
    expect(gameReducer(fresh, lateReply)).toBe(fresh);
  });

  it("a late failure after New game is ignored too", () => {
    const fresh = gameReducer(thinking, { type: "newGame" });
    const late: GameAction = { type: "aiFailed", requestId: thinking.aiRequestId, reasons: ["late"] };
    expect(gameReducer(fresh, late)).toBe(fresh);
  });

  it("a late reply is ignored even when the new game is already waiting on the AI again", () => {
    // New game, human plays the same opening move: the AI is thinking again,
    // but under a different request id.
    const fresh = gameReducer(thinking, { type: "newGame" });
    const newThinking = clicks(fresh, [5, 2], [4, 3]);

    expect(newThinking.aiPhase).toBe("thinking");
    expect(newThinking.aiRequestId).not.toBe(thinking.aiRequestId);
    expect(gameReducer(newThinking, lateReply)).toBe(newThinking);
  });

  it("request ids only ever move forward", () => {
    const ids = [
      thinking.aiRequestId,
      gameReducer(thinking, { type: "newGame" }).aiRequestId,
      gameReducer(thinking, { type: "setMode", mode: "two-player" }).aiRequestId,
    ];
    ids.slice(1).forEach((id) => expect(id).toBeGreaterThan(thinking.aiRequestId));
  });

  it("the legal list is still the engine's: the AI's options are white's moves", () => {
    expect(thinking.legalMoves).toEqual(getLegalMoves(thinking.board, "white"));
  });
});

describe("AI difficulty level", () => {
  it("starts at the default level, or the one given", () => {
    expect(createGameState().aiLevel).toBe(2);
    expect(createGameState({ mode: "vs-ai", aiLevel: 4 }).aiLevel).toBe(4);
  });

  it("can change at any time, even while the AI is thinking, without touching the game", () => {
    const thinking = thinkingState();
    const changed = gameReducer(thinking, { type: "setAiLevel", level: 4 });
    expect(changed.aiLevel).toBe(4);
    expect({ ...changed, aiLevel: thinking.aiLevel }).toEqual(thinking);
    expect(gameReducer(changed, { type: "setAiLevel", level: 4 })).toBe(changed);
  });

  it("is kept by New game and by a mode change", () => {
    const expert = gameReducer(thinkingState(), { type: "setAiLevel", level: 4 });
    expect(gameReducer(expert, { type: "newGame" }).aiLevel).toBe(4);
    expect(gameReducer(expert, { type: "setMode", mode: "two-player" }).aiLevel).toBe(4);
  });

  it("stores the engine's look-ahead for the AI's move in its history entry", () => {
    const thinking = thinkingState();
    const lookahead = { depth: 6, score: 100, best: 100 };
    const state = gameReducer(thinking, {
      type: "aiMoved",
      requestId: thinking.aiRequestId,
      move: thinking.legalMoves[0]!,
      reason: "Wins material.",
      lookahead,
    });
    expect(state.history.at(-1)).toMatchObject({ reason: "Wins material.", lookahead });
  });
});
