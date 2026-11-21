// The AI's personality around the moves (Change 4): a greeting when a game
// starts, idle lines when the player is slow, the resign hint when the
// engine proves the position lost, the line at the end of the game and the
// engine's tips after the AI wins. All lines come from the local banks:
// no model call.
import { useCallback, useEffect, useRef, useState } from "react";
import { analyze } from "../ai/analyzer";
import { gameTips } from "../ai/endgame";
import type { GameTip, PlayedPosition } from "../ai/endgame";
import { fillLine, pickLine, rememberLine, withWinLaugh } from "../ai/lines";
import type { LineContext } from "../ai/lines";
import { aiSideOf, isGameOver } from "../state/gameReducer";
import type { GameState } from "../state/gameReducer";
import type { BubbleTone } from "./ChatBubble";
import { createIdleTimer, createPressureTimer, idleDelay } from "./idleTimer";
import { nextRound, readSession, withResult, writeSession } from "./session";
import { vsAiRecordStore } from "./vsAiRecord";
import type { VsAiOutcome } from "./vsAiRecord";

export interface EndLine {
  readonly text: string;
  readonly tone: BubbleTone;
}

/** Which bank the end of game line comes from. */
export function endContext(state: GameState): LineContext {
  if (state.drawn) return "draw"; // D89
  if (state.abandoned) return "abandoned"; // the AI reported the player (D85)
  if (state.resignedBy === aiSideOf(state)) return "aiResigned"; // D89
  if (state.resignedBy) return "resigned";
  if (state.winner !== aiSideOf(state)) return "playerWon";
  // The engine proved it lost and the player played on anyway (D69).
  if (state.history.some((entry) => entry.provenLoss)) return "aiWonStubborn";
  const blundered = state.history.some((entry) => entry.judgement?.verdict === "blunder");
  return blundered ? "aiWonBlunder" : "aiWon";
}

/** The greeting's bank, from this tab's last result. */
export function greetingContext(last: "won" | "lost" | null): LineContext {
  return last === "lost" ? "startAfterLoss" : last === "won" ? "startAfterWin" : "start";
}

/**
 * A win that could go on the leaderboard later: the player beat the AI by
 * playing, or the AI resigned a position the engine proved lost (D89; the
 * server checks the same proof). The player's own resignation never counts.
 */
export function isSubmittableWin(state: GameState): boolean {
  const ai = aiSideOf(state);
  return state.mode === "vs-ai" && state.winner !== null && state.winner !== ai && (state.resignedBy === null || state.resignedBy === ai);
}

/**
 * A finished game against the AI for this device's record: a win, a loss,
 * or a resignation when the player pressed Resign. An abandoned game (D85)
 * ends like a resignation but is a plain loss.
 */
export function vsAiOutcomeOf(state: GameState): VsAiOutcome {
  if (state.drawn) return "draw"; // D89
  if (state.winner !== aiSideOf(state)) return "win";
  return state.resignedBy !== null && !state.abandoned ? "resigned" : "loss";
}

/** The player's moves of the game, for the tips. */
export function playedPositions(state: GameState): PlayedPosition[] {
  return state.history.flatMap((entry, number) =>
    number > 0 && entry.move && entry.player ? [{ board: state.history[number - 1]!.board, move: entry.move, player: entry.player, number }] : [],
  );
}

// Development only: ?idle=fast shows an idle line every 3 seconds, for
// testing by hand. Production builds use the real delays (30 seconds, then
// every 5).
function idleDelays(): (shown: number) => number {
  const fast = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("idle") === "fast";
  return fast ? () => 3_000 : idleDelay;
}

// The idle lines of a turn escalate (D73, D82): first a check that someone
// is there, from the third the AI loses its patience, and from the sixth it
// warns that it will report the game.
export const ANGRY_FROM_IDLE = 3;
export const WARN_FROM_IDLE = 6;

/** Which bank the n-th idle line of a turn comes from. */
export function idleContext(count: number): LineContext {
  return count >= WARN_FROM_IDLE ? "idleWarn" : count >= ANGRY_FROM_IDLE ? "idleAngry" : "idle";
}

const TONES: Partial<Record<LineContext, BubbleTone>> = { aiWonBlunder: "roast", playerWon: "respect", aiResigned: "respect" };

/** What the resign pressure shows now: nothing during the AI's own line. */
function pressurePart(now: { count: number; showing: boolean; text: string | null } | null, turn: number) {
  if (!now || (now.count === 0 && now.showing)) return null;
  const count = now.showing ? now.count : now.count + 1;
  return { key: `push-${turn}-${count}`, text: now.showing ? now.text : null, count };
}

// The AI's wins, whose last line ends with a random laugh (D69).
const AI_WINS: readonly LineContext[] = ["aiWon", "aiWonBlunder", "aiWonStubborn"];

/** True when the game is over and the AI's last line ends with a laugh (D69, D160). */
export function endsWithWinLaugh(state: GameState): boolean {
  return isGameOver(state) && AI_WINS.includes(endContext(state));
}

// True while the page is on screen (the idle timer pauses otherwise; so
// does the abandon timer, D85).
export function usePageVisible(): boolean {
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
 * `idleAllowed`: it is the player's turn and nothing covers the board (App
 * knows about its sheets and dialogs). `busy`: the player has picked up a
 * piece; idle lines go on regardless (only a move stops them, D82), the
 * resign pressure waits.
 */
export function usePersonality(state: GameState, idleAllowed: boolean, busy = false) {
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
    // When the AI opens (the player is White, D81) its first line comes
    // after its first move, from its own bank: the greetings say "your move
    // first" (D85).
    setGreeting(ai ? say(state.currentPlayer === state.humanSide ? greetingContext(readSession().last) : "aiOpens") : null);
  }, [game, ai]);

  // B: idle lines, after 30 seconds and then every 5 until the player moves.
  const [idle, setIdle] = useState<{ key: string; text: string; count: number; turn: number } | null>(null);
  const timer = useRef<ReturnType<typeof createIdleTimer> | null>(null);
  const sayRef = useRef(say);
  sayRef.current = say;
  const turnRef = useRef(turn);
  turnRef.current = turn;
  timer.current ??= createIdleTimer(
    (count) =>
      setIdle({
        key: `idle-${turnRef.current}-${count}`,
        text: sayRef.current(idleContext(count)),
        count,
        turn: turnRef.current,
      }),
    undefined,
    idleDelays(),
  );
  const pageVisible = usePageVisible();
  useEffect(() => () => timer.current!.stop(), []);
  // An idle line belongs to its turn: it stays while the player picks up a
  // piece or opens a sheet, and goes once their move is played (D73; it used
  // to go at the first tap, and the bubble showed the older line again).

  // D: the resign hint, once per game, only when the engine proved it.
  const [hint, setHint] = useState<{ index: number; text: string } | null>(null);
  const last = state.history[state.history.length - 1]!;
  useEffect(() => setHint(null), [game]);
  useEffect(() => {
    if (ai && !hint && last.provenLoss && !isGameOver(state)) setHint({ index: state.history.length - 1, text: say("resignHint") });
  }, [last]);
  const hintActive = hint !== null && !isGameOver(state);

  // B: the idle timer runs on the player's turn, except while the resign
  // pressure speaks instead.
  const idleActive = ai && idleAllowed && pageVisible && !hintActive;
  useEffect(() => timer.current!.update(idleActive, turn), [idleActive, turn]);

  // F: the resign pressure (D69, D70). Once the position is proven lost, on
  // each of the player's turns: the AI's line for its move stays 10 seconds,
  // then the AI types (the dots wave) for 5, then a new ask to resign for 10,
  // typing again, and so on until the player plays (picking up a piece
  // pauses it).
  const [pressure, setPressure] = useState<{ turn: number; count: number; showing: boolean; text: string | null }>({ turn, count: 0, showing: true, text: null });
  const pressureTimer = useRef<ReturnType<typeof createPressureTimer> | null>(null);
  pressureTimer.current ??= createPressureTimer((next) =>
    setPressure({
      turn: turnRef.current,
      count: next.count,
      showing: next.showing,
      text: next.showing && next.count > 0 ? sayRef.current("resignPush") : null,
    }),
  );
  const pressureActive = ai && hintActive && idleAllowed && !busy && pageVisible;
  useEffect(() => pressureTimer.current!.update(pressureActive, turn), [pressureActive, turn]);
  useEffect(() => () => pressureTimer.current!.stop(), []);
  const pressureNow = hintActive && pressure.turn === turn ? pressure : null;

  // E: the end of the game, recorded once per game in this tab.
  const [end, setEnd] = useState<{ line: EndLine; tips: GameTip[] | null } | null>(null);
  const recordedFor = useRef<unknown>(null); // effects can run twice in development
  useEffect(() => {
    if (!ai || !isGameOver(state)) return setEnd(null);
    if (recordedFor.current !== game) {
      recordedFor.current = game;
      // A draw (D89) is neither: the next greeting stays as it was.
      if (state.winner) writeSession(withResult(readSession(), state.winner !== aiSideOf(state)));
      // The player's own totals on this device (D75).
      vsAiRecordStore.add(vsAiOutcomeOf(state));
    }
    const context = endContext(state);
    const text = AI_WINS.includes(context) ? withWinLaugh(say(context), state.aiLevel) : say(context);
    setEnd({ line: { text, tone: TONES[context] ?? "banter" }, tips: null });
    // Tips only after the AI won by playing: none after an abandoned game
    // (D85), a draw or the AI's resignation (D89).
    if (state.winner !== aiSideOf(state) || state.abandoned) return undefined;
    let cancelled = false;
    const kingsMade = { player: state.stats[state.humanSide].kingsMade, ai: state.stats[aiSideOf(state)].kingsMade };
    void gameTips(playedPositions(state), kingsMade, analyze, state.humanSide).then((tips) => {
      if (!cancelled) setEnd((current) => current && { ...current, tips });
    });
    return () => {
      cancelled = true;
    };
  }, [state.winner, state.drawn, game]);

  return {
    greeting,
    idle: idle && idle.turn === turn ? idle : null,
    hint,
    hintActive,
    // An ask to resign on screen, or the dots while the AI types the next
    // one (D70: `text` null). The dots and the ask they become share a key,
    // so the bubble turns from one into the other without popping twice.
    pressure: pressurePart(pressureNow, turn),
    end,
  };
}
