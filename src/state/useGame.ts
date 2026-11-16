import { useCallback, useEffect, useReducer } from "react";
import { callModel } from "../ai";
import type { Position } from "../engine";
import { startAiTurn } from "./aiController";
import { createGameState, gameReducer } from "./gameReducer";
import { playRecord } from "./playRecord";
import { randomSide } from "./sides";
import type { AiLevel } from "../ai/difficulty";
import type { GameMode, GameOptions, HistoryTarget } from "./gameReducer";

// Connects the pure game reducer to React. Components get the state plus
// functions to send clicks, start a new game, change mode and retry the AI.
// `initial` sets up the first game only (used by the dev preview scenarios);
// New game always starts from the standard position.
export function useGame(initial?: GameOptions) {
  // A recorded game (D60) is played through the reducer's own actions first.
  const [state, dispatch] = useReducer(gameReducer, initial, (options) => playRecord(createGameState(options), options?.record ?? []));

  // Whenever a new AI request starts, ask the model. The effect re-runs only
  // when the request id changes. Its cleanup cancels the pending request, so a
  // New game, a mode change or leaving the page drops the late reply.
  useEffect(() => {
    if (state.aiPhase !== "thinking") return undefined;
    return startAiTurn(state, callModel, dispatch);
    // `state` is deliberately not a dependency: the request must not restart
    // on unrelated state changes.
  }, [state.aiRequestId, state.aiPhase]);

  const click = useCallback(
    (position: Position) => dispatch({ type: "click", position }),
    [],
  );
  // Every new game against the AI gets a new random colour (D81); two
  // player games ignore it.
  const newGame = useCallback(() => dispatch({ type: "newGame", humanSide: randomSide() }), []);
  const setMode = useCallback((mode: GameMode) => dispatch({ type: "setMode", mode, humanSide: randomSide() }), []);
  const retryAi = useCallback(() => dispatch({ type: "aiRetry" }), []);
  const goHistory = useCallback((to: HistoryTarget) => dispatch({ type: "history", to }), []);
  // A new game against the AI at `level` (a level is fixed for a game).
  const playAi = useCallback((level: AiLevel) => dispatch({ type: "newGame", mode: "vs-ai", level, humanSide: randomSide() }), []);

  const resign = useCallback(() => dispatch({ type: "resign" }), []);
  // The player did not move for a minute (D85).
  const abandon = useCallback(() => dispatch({ type: "abandon" }), []);

  return { state, click, newGame, setMode, retryAi, goHistory, playAi, resign, abandon };
}
