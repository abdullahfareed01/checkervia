// Asks a model to pick one of the legal moves, and checks the answer.
// The model call is injected, so tests use fake models and the real API client
// can be added later without changing this file.
import { getLegalMoves } from "../engine";
import type { Board, Move, Player } from "../engine";
import { analyzeHere } from "./analyzer";
import type { Analyze, Lookahead } from "./analyzer";
import { AI_LEVELS } from "./difficulty";
import type { AiLevel } from "./difficulty";
import { parseReply } from "./parseReply";
import { buildPrompt, buildRetryNote } from "./prompt";
import type { OpponentMove } from "./prompt";

// Sends the prompt to a model and returns its text. On a retry, `retryNote`
// explains why the previous answer was rejected.
export type CallModel = (prompt: string, retryNote?: string) => Promise<string>;

// What the engine's look-ahead said about the chosen move, for the popup.
export interface ChosenLookahead {
  readonly depth: number;
  readonly score: number; // the chosen move's score
  readonly best: number; // the best score of any legal move
}

export type ChooseMoveResult =
  // `reason` is the model's own explanation, if it gave one (not verified).
  // `lookahead` is present when the level used the engine's look-ahead.
  // `reaction` is the model's line about the opponent's last move (its
  // trash talk); only kept when there was a move to react to.
  | { ok: true; move: Move; attempts: number; reason?: string; reaction?: string; lookahead?: ChosenLookahead }
  | { ok: false; reasons: string[]; attempts: number };

export interface ChooseMoveOptions {
  level?: AiLevel; // default: 1 (Beginner, no look-ahead); the app always passes one
  analyze?: Analyze; // default: search on the page (the app passes the worker)
  opponent?: OpponentMove; // the opponent's last move and the engine's verdict
}

type AttemptResult =
  | { move: Move; index: number; explanation: string | undefined; reaction: string | undefined }
  // `note` is the retry note for the next call. It is undefined when the model
  // never produced an answer (the call threw), so there is nothing to explain.
  | { reason: string; note: string | undefined };

// One attempt: ask the model, read its answer, and look the chosen number up
// in the legal list. A move can only come out of this function if it is in
// that list.
async function attempt(
  callModel: CallModel,
  prompt: string,
  retryNote: string | undefined,
  moves: readonly Move[],
): Promise<AttemptResult> {
  let text: string;
  try {
    text = await callModel(prompt, retryNote);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reason: `The model call failed: ${message}`, note: undefined };
  }

  const parsed = parseReply(text, moves.length);
  if (!parsed.ok) {
    return { reason: parsed.reason, note: buildRetryNote(parsed.reason, moves.length) };
  }

  const move = moves[parsed.number - 1];
  if (!move) {
    // parseReply already checked the range; this keeps the invariant local.
    const reason = `Move ${parsed.number} is not in the list.`;
    return { reason, note: buildRetryNote(reason, moves.length) };
  }
  return { move, index: parsed.number - 1, explanation: parsed.reason, reaction: parsed.reaction };
}

// The look-ahead for this level, or undefined for Beginner. A failing or
// malformed look-ahead never stops the turn: the model then chooses without
// scores, exactly as at Beginner level.
async function lookaheadFor(
  board: Board,
  player: Player,
  moves: readonly Move[],
  options: ChooseMoveOptions,
): Promise<Lookahead | undefined> {
  const depth = AI_LEVELS[options.level ?? 1].depth;
  if (depth === 0) return undefined;
  try {
    const result = await (options.analyze ?? analyzeHere)(board, player, depth);
    const usable = result.scores.length === moves.length && result.scores.every(Number.isFinite);
    return usable ? result : undefined;
  } catch {
    return undefined;
  }
}

// Picks a move for `player` using the model.
// - At the higher levels the engine first scores every legal move by looking
//   ahead, and the scores go into the prompt.
// - Calls the model once, then retries up to `maxRetries` times (default 3),
//   so at most 1 + maxRetries calls.
// - The move returned always comes from the engine's legal list.
// - If every attempt fails, returns the reasons. It never guesses or picks
//   at random.
export async function chooseMove(
  board: Board,
  player: Player,
  callModel: CallModel,
  maxRetries = 3,
  options: ChooseMoveOptions = {},
): Promise<ChooseMoveResult> {
  const moves = getLegalMoves(board, player);
  if (moves.length === 0) {
    return { ok: false, reasons: ["There are no legal moves to choose from."], attempts: 0 };
  }

  const lookahead = await lookaheadFor(board, player, moves, options);
  const prompt = buildPrompt(board, player, moves, lookahead, options.opponent);
  // A reaction only counts when there was a move to react to.
  const wantsReaction = Boolean(options.opponent);
  const totalCalls = 1 + Math.max(0, Math.trunc(maxRetries));
  const reasons: string[] = [];
  let retryNote: string | undefined;

  for (let call = 1; call <= totalCalls; call++) {
    const result = await attempt(callModel, prompt, retryNote, moves);
    if ("move" in result) {
      const { move, index, explanation, reaction } = result;
      return {
        ok: true,
        move,
        attempts: call,
        ...(explanation === undefined ? {} : { reason: explanation }),
        ...(wantsReaction && reaction !== undefined ? { reaction } : {}),
        ...(lookahead
          ? { lookahead: { depth: lookahead.depth, score: lookahead.scores[index]!, best: Math.max(...lookahead.scores) } }
          : {}),
      };
    }

    reasons.push(result.reason);
    retryNote = result.note;
  }

  return { ok: false, reasons, attempts: totalCalls };
}
