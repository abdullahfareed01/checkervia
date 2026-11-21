// Keeps one room in step with the server (D141): asks for it during a game
// every half second while the opponent is to move and every three seconds on
// the player's own turn (D152), less while waiting, every five seconds while
// the tab is hidden (as a sign of life), at once when the tab comes back or
// the network returns, and on from the answer to each action. Every answer is the room as the
// server sees it; the moves are joined to the ones the browser has.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView } from "../../online/protocol";
import type { ApiResult } from "../leaderboard/api";
import { problemOf } from "../leaderboard/Problem";
import type { Problem } from "../leaderboard/Problem";
import { roomApi } from "./roomApi";
import { rememberRoom } from "./roomMemory";
import { mergeGame, NO_GAME, pollDelay, RETRY_MS, turnOf, WAIT_LIMIT_MS } from "./roomSync";
import type { KnownGame } from "./roomSync";

/** Why the room cannot be used any more: the server's code (roomExpired, notMember...). */
export type Refusal = string;

export interface RoomState {
  readonly view: RoomView | null;
  readonly game: KnownGame;
  readonly receivedAt: number; // Date.now() when the view came: its times count from here
  readonly problem: Problem | null; // the connection, while it lasts
  readonly refusal: Refusal | null;
  readonly paused: boolean; // waiting for a friend stopped asking (WAIT_LIMIT_MS)
}

const REFUSALS = new Set(["roomNotFound", "notMember", "roomExpired", "roomClosed", "noProfile"]);
// The server moved on from what the browser sent: read the whole game again.
const RESYNC = new Set(["stale", "illegal", "notYourTurn", "gameOver", "notStarted", "gameOn", "tooLong"]);

export function useRoom(code: string, first: RoomView | null) {
  const [state, setState] = useState<RoomState>(() => ({
    view: first,
    game: first ? mergeGame(NO_GAME, first).game : NO_GAME,
    receivedAt: Date.now(),
    problem: null,
    refusal: null,
    paused: false,
  }));
  const known = useRef(state.game);
  const pollNow = useRef<() => void>(() => {});
  // After an action's answer: the next poll counts from it (D152).
  const pollAfter = useRef<(view: RoomView) => void>(() => {});
  const waitingSince = useRef<number | null>(null);

  /** Takes in a view; true when moves are missing and the room must be read again at once. */
  const apply = useCallback((view: RoomView): boolean => {
    const { game, gap } = mergeGame(known.current, view);
    known.current = game;
    if (view.status === "closed" || view.status === "expired") rememberRoom(null);
    setState((current) => ({ ...current, view, game, receivedAt: Date.now(), problem: null }));
    return gap;
  }, []);

  /** What a failed request means: a refusal ends the room; anything else is a problem that may pass. */
  const failed = useCallback((result: Exclude<ApiResult<unknown>, { kind: "ok" }>) => {
    if (result.kind === "failed" && REFUSALS.has(result.code)) {
      rememberRoom(null);
      setState((current) => ({ ...current, refusal: result.code }));
      return null;
    }
    if (result.kind === "failed" && RESYNC.has(result.code)) {
      known.current = NO_GAME;
      return 0;
    }
    setState((current) => ({ ...current, problem: problemOf(result) }));
    return result.kind === "failed" && result.status === 429 ? Math.max(RETRY_MS, (result.retryAfter ?? 3) * 1000) : RETRY_MS;
  }, []);

  useEffect(() => {
    if (state.paused || state.refusal) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    // How long the last poll's answer took: the wait makes up the rest of the turn's cycle.
    let answerMs: number | null = null;

    const run = async () => {
      clearTimeout(timer);
      if (stopped) return;
      controller?.abort();
      controller = new AbortController();
      const hidden = document.visibilityState === "hidden";
      let result: ApiResult<{ room: RoomView }>;
      const asked = performance.now();
      try {
        result = await roomApi.state(code, known.current.moves.length, hidden, controller.signal);
      } catch {
        return; // cancelled: a newer request is on its way
      }
      if (stopped) return;
      if (result.kind === "ok") answerMs = performance.now() - asked;
      let delay: number | null;
      if (result.kind === "ok") {
        const view = result.value.room;
        const gap = apply(view);
        if (view.status === "waiting") waitingSince.current ??= Date.now();
        else waitingSince.current = null;
        if (waitingSince.current !== null && Date.now() - waitingSince.current > WAIT_LIMIT_MS) {
          setState((current) => ({ ...current, paused: true }));
          return;
        }
        delay = gap ? 0 : pollDelay(view.status, hidden, turnOf(view), answerMs);
      } else {
        delay = failed(result);
      }
      clearTimeout(timer);
      if (delay !== null) timer = setTimeout(() => void run(), delay);
    };

    pollNow.current = () => void run();
    // The answer to an action is the newest room: a poll still on its way
    // was asked before it, so it is dropped, and the next one is timed from
    // this answer (half a second after the player's own move).
    pollAfter.current = (view: RoomView) => {
      if (stopped) return;
      controller?.abort();
      controller = null;
      clearTimeout(timer);
      const delay = pollDelay(view.status, document.visibilityState === "hidden", turnOf(view), answerMs);
      if (delay !== null) timer = setTimeout(() => void run(), delay);
    };
    void run();
    const wake = () => void run();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [code, state.paused, state.refusal, apply, failed]);

  /** Runs an action; its answer is the room after it. Answers the result for the caller's own words. */
  const act = useCallback(
    async (request: () => Promise<ApiResult<{ room: RoomView }>>) => {
      const result = await request();
      if (result.kind === "ok") {
        if (apply(result.value.room)) pollNow.current();
        else pollAfter.current(result.value.room);
      } else if (failed(result) === 0) {
        pollNow.current();
      }
      return result;
    },
    [apply, failed],
  );

  const match = state.view?.match?.number ?? 0;
  return {
    ...state,
    sendMove: useCallback((ply: number, move: readonly number[]) => act(() => roomApi.move(code, match, ply, move)), [act, code, match]),
    resign: useCallback(() => act(() => roomApi.resign(code, match)), [act, code, match]),
    rematch: useCallback(() => act(() => roomApi.rematch(code, match)), [act, code, match]),
    leave: useCallback(async () => {
      rememberRoom(null);
      await roomApi.leave(code);
    }, [code]),
    keepWaiting: useCallback(() => {
      waitingSince.current = null;
      setState((current) => ({ ...current, paused: false }));
    }, []),
  };
}

export type RoomConnection = ReturnType<typeof useRoom>;
