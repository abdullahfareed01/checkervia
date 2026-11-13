// Asks a model to pick one of the legal moves, and checks the answer.
// The model call is injected, so tests use fake models and the real API client
// can be added later without changing this file.
import { getLegalMoves } from "../engine";
import type { Board, Move, Player } from "../engine";
import { analyzeHere } from "./analyzer";
import type { Analyze, Lookahead } from "./analyzer";
import { pickCandidates } from "./candidates";
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
  readonly depth: number; // turns (plies) searched
  readonly score: number; // the chosen move's score
  readonly best: number; // the best score of any legal move
  readonly offered: number; // how many moves the model could choose from
  readonly legal: number; // how many legal moves there were
  readonly scoresShown: boolean; // false on an Easy-level slip (no scores in the prompt)
}

export type ChooseMoveResult =
  // `reason` is the model's own explanation, if it gave one (not verified).
  // `lookahead` is present when the level used the engine's look-ahead.
  // `reaction` is the model's line about the opponent's last move (its
  // trash talk); only kept when there was a move to react to.
  | { ok: true; move: Move; attempts: number; reason?: string; reaction?: string; lookahead?: ChosenLookahead }
  | { ok: false; reasons: string[]; attempts: number };

export interface ChooseMoveOptions {
  // The app always passes one. Without a level the model gets every legal
  // move and no engine help (the original brief's mode, used by many tests).
  level?: AiLevel;
  analyze?: Analyze; // default: search on the page (the app passes the worker)
  opponent?: OpponentMove; // the opponent's last move and the engine's verdict
  random?: () => number; // decides the Easy level's slips; default Math.random
}

// What the model is offered: the moves it may choose from (all legal moves,
// or the level's best few), the scores to show with them, and what the
// popup will say about the look-ahead.
interface Offer {
  readonly choices: readonly Move[];
  readonly shown?: Lookahead; // scores for `choices`, if the prompt shows them
  readonly info?: Omit<ChosenLookahead, "score">;
  readonly scoreOf?: readonly number[]; // look-ahead score of each choice
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

// The look-ahead scores, or undefined if the search failed or sent scores
// that do not fit the move list.
async function scoresFor(board: Board, player: Player, moves: readonly Move[], depth: number, analyze: Analyze) {
  try {
    const result = await analyze(board, player, depth);
    const usable = result.scores.length === moves.length && result.scores.every(Number.isFinite);
    return usable ? result.scores : undefined;
  } catch {
    return undefined;
  }
}

// Works out what the model is offered at this level (D44). The engine scores
// every legal move `depth` turns ahead; the model gets the level's best few
// (every move at Easy). On an Easy slip the scores are left out, so the model
// chooses on its own. Returns null when a level that limits the moves could
// not score them: it cannot build its list, so the turn fails (Retry).
async function offerFor(board: Board, player: Player, moves: readonly Move[], options: ChooseMoveOptions): Promise<Offer | null> {
  if (options.level === undefined) return { choices: moves };
  const { depth, candidates, slipChance } = AI_LEVELS[options.level];
  const scores = await scoresFor(board, player, moves, depth, options.analyze ?? analyzeHere);
  if (!scores) return candidates === undefined ? { choices: moves } : null;

  const picked = pickCandidates(scores, candidates);
  const scoreOf = picked.map((index) => scores[index]!);
  const slip = slipChance > 0 && (options.random ?? Math.random)() < slipChance;
  return {
    choices: picked.map((index) => moves[index]!),
    scoreOf,
    ...(slip ? {} : { shown: { depth, scores: scoreOf } }),
    info: { depth, best: Math.max(...scores), offered: picked.length, legal: moves.length, scoresShown: !slip },
  };
}

// Picks a move for `player` using the model.
// - At every level the engine first scores the legal moves by looking ahead;
//   the model is offered the level's best few, with their scores.
// - Calls the model once, then retries up to `maxRetries` times (default 3),
//   so at most 1 + maxRetries calls.
// - The move returned always comes from the offered list, which comes from
//   the engine's legal list.
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

  const offer = await offerFor(board, player, moves, options);
  if (!offer) {
    return { ok: false, reasons: ["The engine's look-ahead failed, so the AI's moves could not be listed."], attempts: 0 };
  }
  const prompt = buildPrompt(board, player, offer.choices, offer.shown, options.opponent, moves.length);
  // A reaction only counts when there was a move to react to.
  const wantsReaction = Boolean(options.opponent);
  const totalCalls = 1 + Math.max(0, Math.trunc(maxRetries));
  const reasons: string[] = [];
  let retryNote: string | undefined;

  for (let call = 1; call <= totalCalls; call++) {
    const result = await attempt(callModel, prompt, retryNote, offer.choices);
    if ("move" in result) {
      const { move, index, explanation, reaction } = result;
      return {
        ok: true,
        move,
        attempts: call,
        ...(explanation === undefined ? {} : { reason: explanation }),
        ...(wantsReaction && reaction !== undefined ? { reaction } : {}),
        ...(offer.info && offer.scoreOf ? { lookahead: { ...offer.info, score: offer.scoreOf[index]! } } : {}),
      };
    }

    reasons.push(result.reason);
    retryNote = result.note;
  }

  return { ok: false, reasons, attempts: totalCalls };
}
