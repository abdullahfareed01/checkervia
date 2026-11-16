// Local line banks for the AI's personality (Change 4): greetings, idle
// lines, resigning, the end of the game and the resign hint. No model call:
// instant and free. Every line follows the language rules of its level
// (checked by tests through checkReaction), has no hyphens or dashes and is
// at most 140 characters. Voices: Easy warm and encouraging, Medium playful,
// Hard cocky, Strongest savage and mocking (only Strongest insults the play).
// Mild swearing appears only in "aiWonBlunder" at Strongest: the game is
// over and the engine verified at least one blunder by the player.
import type { AiLevel } from "./difficulty";
import { EASY, MEDIUM } from "./linesGentle";
import { HARD, STRONGEST } from "./linesFierce";

export type LineContext =
  | "start" // the first game against the AI this session
  | "startAfterLoss" // a new game after the player lost the last one
  | "startAfterWin" // a new game after the player won the last one
  | "idle" // the player has not moved for a while
  | "idleAngry" // the third to fifth idle line of a turn: losing patience (D73)
  | "idleWarn" // the sixth idle line and after: warnings to report the game (D82)
  | "aiOpens" // after the AI's first move, when it opens the game (the player is White, D85)
  | "abandoned" // the game was abandoned: the AI reported the player (D85)
  | "resigned" // the player resigned
  | "aiWon" // the AI won, no verified blunder by the player
  | "aiWonBlunder" // the AI won after at least one verified blunder
  | "playerWon" // the player won
  | "resignHint" // the engine proved the player's position is lost
  | "resignPush" // the position is proven lost and the player keeps stalling (D69)
  | "aiWonStubborn"; // the AI won after the player ignored the resign hint (D69)

export type Bank = Readonly<Record<LineContext, readonly string[]>>;

export const LINE_BANKS: Readonly<Record<AiLevel, Bank>> = { 1: EASY, 2: MEDIUM, 3: HARD, 4: STRONGEST };

/** Lines remembered per context, newest last, so none of the last 3 repeats. */
export type RecentLines = Partial<Record<LineContext, readonly string[]>>;
export const NO_REPEAT = 3;

/**
 * A line for `context` at `level`, not one of the last 3 shown in that
 * context. `random` picks among the allowed lines (tests pass a fixed
 * one). Fill in `{round}` with fillLine.
 */
export function pickLine(
  context: LineContext,
  level: AiLevel,
  recent: RecentLines,
  random: () => number = Math.random,
): string {
  const bank = LINE_BANKS[level][context];
  const last = (recent[context] ?? []).slice(-NO_REPEAT);
  const allowed = bank.filter((line) => !last.includes(line));
  return allowed[Math.floor(random() * allowed.length) % allowed.length]!;
}

// The laughs added to the AI's last line when it wins (D69), picked at random.
export const WIN_LAUGHS = ["Haha!", "Hahaha!", "Hahahahah!"] as const;

/**
 * The AI's last line when it wins, with a random laugh after it (D69), at
 * every level but Easy (whose voice stays kind). The longest laugh that fits
 * the 140 character cap; none if even the shortest would not fit.
 */
export function withWinLaugh(line: string, level: AiLevel, random: () => number = Math.random): string {
  if (level === 1) return line;
  const laugh = WIN_LAUGHS[Math.floor(random() * WIN_LAUGHS.length) % WIN_LAUGHS.length]!;
  const fitting = [laugh, ...WIN_LAUGHS].find((option) => line.length + 1 + option.length <= 140);
  return fitting ? `${line} ${fitting}` : line;
}

/** The line as shown, with the round number filled in. */
export function fillLine(line: string, round: number): string {
  return line.replace(/\{round\}/g, String(round));
}

/** `recent` with `line` added for `context`, keeping only the last few. */
export function rememberLine(recent: RecentLines, context: LineContext, line: string): RecentLines {
  return { ...recent, [context]: [...(recent[context] ?? []), line].slice(-NO_REPEAT) };
}
