// The AI turn flow end to end with a fake model: the controller asks the
// model, dispatches the result into the real reducer, and late replies are
// ignored. No network, no real API.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallModel } from "../ai";
import { getLegalMoves } from "../engine";
import { at, boardFrom } from "../engine/testUtils";
import { startAiTurn } from "./aiController";
import { createGameState, gameReducer } from "./gameReducer";
import type { GameAction, GameState } from "./gameReducer";

// A tiny store: applies each dispatched action with the real reducer.
function createStore(initial: GameState) {
  let state = initial;
  const actions: GameAction[] = [];
  return {
    get state() {
      return state;
    },
    actions,
    dispatch: (action: GameAction) => {
      actions.push(action);
      state = gameReducer(state, action);
    },
  };
}

// A fake model that plays back replies. A string is returned, an Error is thrown.
function scriptedModel(script: (string | Error)[]) {
  const calls: { prompt: string; note: string | undefined }[] = [];
  const callModel: CallModel = async (prompt, note) => {
    calls.push({ prompt, note });
    const step = script[calls.length - 1];
    if (step === undefined) throw new Error("unexpected extra call");
    if (step instanceof Error) throw step;
    return step;
  };
  return { callModel, calls };
}

// A model whose answer we release by hand, to test timing. The reply may be
// given before the model is called (the call waits for the engine's
// look-ahead first); it is then handed over as soon as the call happens.
function manualModel() {
  let release: ((text: string) => void) | null = null;
  let early: string | null = null;
  const callModel: CallModel = () =>
    new Promise<string>((resolve) => {
      if (early !== null) resolve(early);
      else release = resolve;
    });
  const reply = (text: string) => {
    if (release) release(text);
    else early = text;
  };
  return { callModel, reply };
}

// Black has just moved in a vs-AI game, so the AI (white) is thinking.
function thinkingStore() {
  const afterHuman = [at(5, 2), at(4, 3)].reduce(
    (state, position) => gameReducer(state, { type: "click", position }),
    createGameState({ mode: "vs-ai" }),
  );
  return createStore(afterHuman);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AI turn flow", () => {
  it("ends a hung turn within its total budget and never plays a late reply", async () => {
    const store = thinkingStore();
    const { callModel, reply } = manualModel();
    const requestId = store.state.aiRequestId;
    startAiTurn(store.state, callModel, store.dispatch, { timeoutMs: 30 });
    await vi.waitFor(() => expect(store.state.aiPhase).toBe("failed"));
    expect(store.actions).toHaveLength(1);
    expect(store.actions[0]).toMatchObject({ type: "aiFailed", requestId, reasons: ["The AI took too long. Retry to ask again."] });
    const failed = store.state;
    reply('{"move": 1}');
    await settle();
    expect(store.actions).toHaveLength(1);
    expect(store.state).toBe(failed);
  });

  it("aborts the model request when a turn is cancelled, without dispatching a failure", async () => {
    const store = thinkingStore();
    const signals: AbortSignal[] = [];
    const callModel: CallModel = (_prompt, _note, signal) => {
      if (signal) signals.push(signal);
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true }));
    };
    const cancel = startAiTurn(store.state, callModel, store.dispatch);
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    cancel();
    await settle();
    expect(signals[0]!.aborted).toBe(true);
    expect(store.actions).toEqual([]);
  });
  it("asks the model about white's position and plays the move it picks", async () => {
    const store = thinkingStore();
    const whiteMoves = getLegalMoves(store.state.board, "white");
    const { callModel, calls } = scriptedModel(['{"move": 2}']);

    startAiTurn(store.state, callModel, store.dispatch);
    await vi.waitFor(() => expect(store.state.aiPhase).toBe("idle"));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toContain("You are playing White.");
    expect(store.state.lastMove).toEqual(whiteMoves[1]);
    expect(store.state.currentPlayer).toBe("black");
    expect(store.state.movesPlayed).toBe(2);
  });

  it("dispatches nothing until the model has answered", async () => {
    const store = thinkingStore();
    const { callModel } = manualModel();

    startAiTurn(store.state, callModel, store.dispatch);
    await settle();

    expect(store.actions).toEqual([]);
    expect(store.state.aiPhase).toBe("thinking");
  });

  it("tags its reply with the request id of the turn it was started for", async () => {
    const store = thinkingStore();
    const requestId = store.state.aiRequestId;
    const { callModel } = scriptedModel(['{"move": 1}']);

    startAiTurn(store.state, callModel, store.dispatch);
    await vi.waitFor(() => expect(store.actions).toHaveLength(1));

    expect(store.actions[0]).toMatchObject({ type: "aiMoved", requestId });
  });

  it("sends the model's reason along with the move", async () => {
    const store = thinkingStore();
    const { callModel } = scriptedModel(['{"move": 1, "reason": "Opens the centre."}']);

    startAiTurn(store.state, callModel, store.dispatch);
    await vi.waitFor(() => expect(store.actions).toHaveLength(1));

    expect(store.actions[0]).toMatchObject({ type: "aiMoved", reason: "Opens the centre." });
  });

  it("retries a bad reply, then plays the good one", async () => {
    const store = thinkingStore();
    const { callModel, calls } = scriptedModel(["I like the second move", '{"move": 1}']);

    startAiTurn(store.state, callModel, store.dispatch);
    await vi.waitFor(() => expect(store.state.aiPhase).toBe("idle"));

    expect(calls).toHaveLength(2);
    expect(calls[1]!.note).toContain("rejected");
    expect(store.state.movesPlayed).toBe(2);
  });
});

describe("fallback and Retry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("after 4 bad replies the AI fails, no move is played, and the board stays locked", async () => {
    const store = thinkingStore();
    const boardBefore = store.state.board;
    const { callModel, calls } = scriptedModel(["x", '{"move": 99}', '{"move": 0}', "no"]);

    startAiTurn(store.state, callModel, store.dispatch);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.state.aiPhase).toBe("failed");

    expect(calls).toHaveLength(4);
    expect(store.state.board).toBe(boardBefore);
    expect(store.state.movesPlayed).toBe(1);
    expect(store.state.currentPlayer).toBe("white");
    expect(store.state.aiFailureReasons).toHaveLength(4);

    // Locked: a click does nothing.
    store.dispatch({ type: "click", position: at(2, 1) });
    expect(store.state.board).toBe(boardBefore);
  });

  it("a model that always throws also ends in the fallback", async () => {
    const store = thinkingStore();
    const boom = new Error("network down");
    const { callModel, calls } = scriptedModel([boom, boom, boom, boom]);

    startAiTurn(store.state, callModel, store.dispatch);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.state.aiPhase).toBe("failed");

    expect(calls).toHaveLength(4);
    expect(store.state.aiFailureReasons.join(" ")).toContain("network down");
  });

  it("Retry asks again and, if the model now answers, plays the move", async () => {
    const store = thinkingStore();
    startAiTurn(store.state, scriptedModel(["x", "x", "x", "x"]).callModel, store.dispatch);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.state.aiPhase).toBe("failed");

    store.dispatch({ type: "aiRetry" });
    expect(store.state.aiPhase).toBe("thinking");

    startAiTurn(store.state, scriptedModel(['{"move": 1}']).callModel, store.dispatch);
    await vi.waitFor(() => expect(store.state.aiPhase).toBe("idle"));
    expect(store.state.movesPlayed).toBe(2);
    expect(store.state.currentPlayer).toBe("black");
  });

  it("New game works while the board is locked after a failure", async () => {
    const store = thinkingStore();
    startAiTurn(store.state, scriptedModel(["x", "x", "x", "x"]).callModel, store.dispatch);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.state.aiPhase).toBe("failed");

    store.dispatch({ type: "newGame" });
    expect(store.state.aiPhase).toBe("idle");
    expect(store.state.movesPlayed).toBe(0);
    store.dispatch({ type: "click", position: at(5, 2) });
    expect(store.state.selected).toEqual(at(5, 2));
  });
});

describe("stale responses", () => {
  it("cancelling the request means a late reply dispatches nothing", async () => {
    const store = thinkingStore();
    const { callModel, reply } = manualModel();

    const cancel = startAiTurn(store.state, callModel, store.dispatch);
    cancel();
    reply('{"move": 1}');
    await settle();

    expect(store.actions).toEqual([]);
  });

  it("a late reply after New game does not touch the new game, even if it is delivered", async () => {
    const store = thinkingStore();
    const { callModel, reply } = manualModel();

    startAiTurn(store.state, callModel, store.dispatch); // not cancelled on purpose
    store.dispatch({ type: "newGame" });
    const freshState = store.state;

    reply('{"move": 1}');
    await vi.waitFor(() => expect(store.actions.some((a) => a.type === "aiMoved")).toBe(true));

    // The reply reached the reducer, and the reducer ignored it.
    expect(store.state).toBe(freshState);
    expect(store.state.movesPlayed).toBe(0);
    expect(store.state.currentPlayer).toBe("black");
  });

  it("a late reply after a mode change does not touch the new game", async () => {
    const store = thinkingStore();
    const { callModel, reply } = manualModel();

    startAiTurn(store.state, callModel, store.dispatch);
    store.dispatch({ type: "setMode", mode: "two-player" });
    const freshState = store.state;

    reply('{"move": 1}');
    await vi.waitFor(() => expect(store.actions.some((a) => a.type === "aiMoved")).toBe(true));

    expect(store.state).toBe(freshState);
    expect(store.state.mode).toBe("two-player");
  });

  it("a late failure after New game is ignored", async () => {
    const store = thinkingStore();
    const slowFailure: CallModel = () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("late")), 5));

    startAiTurn(store.state, slowFailure, store.dispatch);
    store.dispatch({ type: "newGame" });
    const freshState = store.state;

    await vi.waitFor(() => expect(store.actions.some((a) => a.type === "aiFailed")).toBe(true), { timeout: 3000 });
    expect(store.state).toBe(freshState);
    expect(store.state.aiPhase).toBe("idle");
  });

  it("ignores board clicks while the model is still thinking", async () => {
    const store = thinkingStore();
    const { callModel } = manualModel();
    startAiTurn(store.state, callModel, store.dispatch);
    const lockedState = store.state;

    store.dispatch({ type: "click", position: at(2, 1) });
    store.dispatch({ type: "click", position: at(4, 3) });

    expect(store.state).toBe(lockedState);
  });
});

// D89: the AI resigns, instead of moving, when its own position is proven
// lost (every move loses by force within the engine's proof).
describe("the AI resigns a lost position", () => {
  // White's last man can only step to 2,1, where Black's man takes it.
  const LOST = boardFrom([
    "........",
    "w.......",
    "........",
    "..b.....",
    "........",
    "........",
    "........",
    "........",
  ]);

  it("resigns without asking the model; the player wins", async () => {
    const store = createStore(createGameState({ board: LOST, mode: "vs-ai", humanSide: "black", currentPlayer: "white" }));
    expect(store.state.aiPhase).toBe("thinking");
    const { callModel, calls } = scriptedModel([]);
    startAiTurn(store.state, callModel, store.dispatch);
    await vi.waitFor(() => expect(store.actions).toHaveLength(1));
    expect(store.actions[0]).toEqual({ type: "aiResigned", requestId: store.state.aiRequestId - 1 });
    expect(calls).toHaveLength(0);
    expect(store.state.winner).toBe("black");
    expect(store.state.resignedBy).toBe("white");
  });
});
