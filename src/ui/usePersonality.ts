// The AI's personality around the moves (Change 4): a greeting when a game
// starts, idle lines when the player is slow, the resign hint when the
// engine proves the position lost, the line at the end of the game and the
// engine's tips after the AI wins. All lines come from the local banks:
// no model call.
import { useCallback, useEffect, useRef, useState } from "react";
import { analyze } from "../ai/analyzer";
import { gameTips } from "../ai/endgame";
import type { GameTip, PlayedPosition } from "../ai/endgame";
import { fillLine, pickLine, rememberLine } from "../ai/lines";
import type { LineContext } from "../ai/lines";
import { AI_PLAYER } from "../state/gameReducer";
import type { GameState } from "../state/gameReducer";
import type { BubbleTone } from "./ChatBubble";
import { IDLE_EVERY_MS, createIdleTimer } from "./idleTimer";
import { nextRound, readSession, withResult, writeSession } from "./session";

export interface EndLine {
  readonly text: string;
  readonly tone: BubbleTone;
}

/** Which bank the end of game line comes from. */
export function endContext(state: GameState): LineContext {
  if (state.resignedBy) return "resigned";
  if (state.winner !== AI_PLAYER) return "playerWon";
  const blundered = state.history.some((entry) => entry.judgement?.verdict === "blunder");
  return blundered ? "aiWonBlunder" : "aiWon";
}

/** The greeting's bank, from this tab's last result. */
export function greetingContext(last: "won" | "lost" | null): LineContext {
  return last === "lost" ? "startAfterLoss" : last === "won" ? "startAfterWin" : "start";
}

/**
 * A win that could go on the leaderboard later: the player beat the AI by
 * playing. A resignation never counts, whoever resigned.
 */
export function isSubmittableWin(state: GameState): boolean {
  return state.mode === "vs-ai" && state.winner !== null && state.winner !== AI_PLAYER && state.resignedBy === null;
}

/** The player's moves of the game, for the tips. */
export function playedPositions(state: GameState): PlayedPosition[] {
  return state.history.flatMap((entry, number) =>
    number > 0 && entry.move && entry.player ? [{ board: state.history[number - 1]!.board, move: entry.move, player: entry.player, number }] : [],
  );
}

// Development only: ?idle=fast shows an idle line every 3 seconds, for
// testing by hand. Production builds always wait 30 seconds between lines.
function idleEvery(): number {
  const fast = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("idle") === "fast";
  return fast ? 3_000 : IDLE_EVERY_MS;
}

const TONES: Partial<Record<LineContext, BubbleTone>> = { aiWonBlunder: "roast", playerWon: "respect" };

// True while the page is on screen (the idle timer pauses otherwise).
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

/**
 * `idleAllowed`: the board is interactive on the player's turn and nothing
 * covers it (App knows about its sheets and dialogs).
 */
export function usePersonality(state: GameState, idleAllowed: boolean) {
  const ai = state.mode === "vs-ai";
  const game = state.history[0]; // a new object for every new game
  const turn = state.aiRequestId; // changes with every AI turn and every new game

  // Picks a line, remembers it in this tab so it does not repeat soon.
  const say = useCallback(
    (context: LineContext) => {
      const record = readSession();
      const line = pickLine(context, state.aiLevel, record.recent);
      writeSession({ ...record, recent: rememberLine(record.recent, context, line) });
      return fillLine(line, nextRound(record));
    },
    [state.aiLevel],
  );

  // A: the greeting, fresh for every game against the AI.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    setGreeting(ai ? say(greetingContext(readSession().last)) : null);
  }, [game, ai]);

  // B: idle lines, every 30 seconds until the player moves.
  const [idle, setIdle] = useState<{ key: string; text: string; count: number; turn: number } | null>(null);
  const timer = useRef<ReturnType<typeof createIdleTimer> | null>(null);
  const sayRef = useRef(say);
  sayRef.current = say;
  const turnRef = useRef(turn);
  turnRef.current = turn;
  timer.current ??= createIdleTimer(
    (count) => setIdle({ key: `idle-${turnRef.current}-${count}`, text: sayRef.current("idle"), count, turn: turnRef.current }),
    undefined,
    idleEvery(),
  );
  const pageVisible = usePageVisible();
  const idleActive = ai && idleAllowed && pageVisible;
  useEffect(() => timer.current!.update(idleActive, turn), [idleActive, turn]);
  useEffect(() => () => timer.current!.stop(), []);
  // An idle line belongs to its turn, and goes when the player starts moving.
  useEffect(() => {
    if (!idleAllowed) setIdle(null);
  }, [idleAllowed, turn]);

  // D: the resign hint, once per game, only when the engine proved it.
  const [hint, setHint] = useState<{ index: number; text: string } | null>(null);
  const last = state.history[state.history.length - 1]!;
  useEffect(() => setHint(null), [game]);
  useEffect(() => {
    if (ai && !hint && last.provenLoss && !state.winner) setHint({ index: state.history.length - 1, text: say("resignHint") });
  }, [last]);

  // E: the end of the game, recorded once per game in this tab.
  const [end, setEnd] = useState<{ line: EndLine; tips: GameTip[] | null } | null>(null);
  const recordedFor = useRef<unknown>(null); // effects can run twice in development
  useEffect(() => {
    if (!ai || !state.winner) return setEnd(null);
    if (recordedFor.current !== game) {
      recordedFor.current = game;
      writeSession(withResult(readSession(), state.winner !== AI_PLAYER));
    }
    const context = endContext(state);
    setEnd({ line: { text: say(context), tone: TONES[context] ?? "banter" }, tips: null });
    if (state.winner !== AI_PLAYER) return undefined;
    let cancelled = false;
    void gameTips(playedPositions(state), { player: state.stats.black.kingsMade, ai: state.stats.white.kingsMade }, analyze).then((tips) => {
      if (!cancelled) setEnd((current) => current && { ...current, tips });
    });
    return () => {
      cancelled = true;
    };
  }, [state.winner, game]);

  return {
    greeting,
    idle: idle && idle.turn === turn ? idle : null,
    hint,
    hintActive: hint !== null && !state.winner,
    end,
  };
}
