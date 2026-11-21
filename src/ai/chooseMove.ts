// Asks a model to pick one of the legal moves, and checks the answer.
// The model call is injected, so tests use fake models and the real API client
// can be added later without changing this file.
import { getLegalMoves } from "../engine";
import type { Board, Move, Player } from "../engine";
import { analyzeHere } from "./analyzer";
import type { Analyze, Lookahead } from "./analyzer";
import { pickCandidates } from "./candidates";
import { checkReaction, checkReason } from "./language";
import { AI_LEVELS } from "./difficulty";
import type { AiLevel } from "./difficulty";
import { parseReply } from "./parseReply";
import { ModelServiceError } from "./serviceError";
import { buildPrompt, buildRetryNote } from "./prompt";
import type { OpponentMove } from "./prompt";
import { EngineFallbackError } from "./request";
import type { ModelContext } from "./request";
import { turnLine } from "./chat";

// Sends the prompt to a model and returns its text. On a retry, `retryNote`
// explains why the previous answer was rejected.
export type CallModel = ((prompt: string, retryNote?: string, signal?: AbortSignal, context?: ModelContext) => Promise<string>) & { readonly handlesChain?: boolean };

// What the engine's look-ahead said about the chosen move, for the popup.
export interface ChosenLookahead {
  // Who selected this move; scores themselves always come from the engine.
  readonly source?: "engine";
  readonly depth: number; // turns (plies) searched
  readonly score: number; // the chosen move's score
  readonly best: number; // the best score of any legal move
  readonly offered: number; // how many moves the model could choose from
  readonly legal: number; // how many legal moves there were
  readonly scoresShown: boolean; // false on an Easy-level slip (no scores in the prompt)
}

export type ChooseMoveResult =
  // `reason` is the model's own explanation, if it gave one (not verified,
  // but always clean: see language.ts).
  // `lookahead` is present when the level used the engine's look-ahead.
  // `reaction` is the model's line about the opponent's last move; only kept
  // when there was a move to react to, and replaced by a clean line if it
  // breaks the level's language rules (D45).
  | { ok: true; move: Move; attempts: number; reason?: string; reaction?: string; lookahead?: ChosenLookahead }
  | { ok: false; reasons: string[]; attempts: number };

export interface ChooseMoveOptions {
  engineFallback?: boolean;
  opening?: boolean;
  lineSeed?: number;
  onFallbackReady?: (result: Extract<ChooseMoveResult, { ok: true }>) => void;
  signal?: AbortSignal;
  retryDelayMs?: number; // the controller uses a short exponential backoff
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
  | { reason: string; note: string | undefined; retryable?: boolean; retryAfterMs?: number; fallback?: boolean };

// One attempt: ask the model, read its answer, and look the chosen number up
// in the legal list. A move can only come out of this function if it is in
// that list.
async function attempt(
  callModel: CallModel,
  prompt: string,
  retryNote: string | undefined,
  moves: readonly Move[],
  signal?: AbortSignal,
  context?: ModelContext,
): Promise<AttemptResult> {
  let text: string;
  try {
    signal?.throwIfAborted();
    text = await (context ? callModel(prompt, retryNote, signal, context) : callModel(prompt, retryNote, signal));
    signal?.throwIfAborted();
  } catch (error) {
    if (error instanceof EngineFallbackError) return { reason: error.message, note: undefined, retryable: false, fallback: true };
    const message = error instanceof Error ? error.message : String(error);
    return { reason: `The model call failed: ${message}`, note: undefined, retryable: !signal?.aborted && (!(error instanceof ModelServiceError) || error.retryable), retryAfterMs: error instanceof ModelServiceError ? error.retryAfterMs : 0 };
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

// A provider delay must end immediately when the turn is cancelled.
function waitToRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// Picks from the engine's offered legal moves. At most three retries;
// permanent failures and cancellation stop sooner. Never guesses a move.
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
    return { ok: false, reasons: ["The engine's look ahead failed, so the AI's moves could not be listed."], attempts: 0 };
  }
  const prompt = buildPrompt(board, player, offer.choices, offer.shown, options.opponent, moves.length);
  const bestIndex = offer.scoreOf ? offer.scoreOf.reduce((best, score, index, scores) => score > scores[best]! ? index : best, 0) : 0;
  // The turn cue is a reply to the player's move, so there is none when the
  // AI opens the game: the bubble then shows its opening greeting (D85, D154).
  const cue = options.opponent ? { reaction: turnLine("human", options.level ?? 2, options.lineSeed ?? 0) } : {};
  const fallback = (attempts: number): Extract<ChooseMoveResult, { ok: true }> => ({
    ok: true, move: offer.choices[bestIndex]!, attempts,
    reason: "The engine chose its best scored legal move for this level.",
    ...cue,
    ...(offer.info && offer.scoreOf ? { lookahead: { ...offer.info, score: offer.scoreOf[bestIndex]!, scoresShown: true, source: "engine" as const } } : {}),
  });
  if (options.engineFallback) options.onFallbackReady?.(fallback(0));
  const context: ModelContext | undefined = options.engineFallback ? {
    job: "move", board, player, level: options.level ?? 2, opening: options.opening ?? false,
    candidates: offer.choices.map(move => moves.indexOf(move)),
    ...(offer.shown ? { scores: offer.shown.scores } : {}),
  } : undefined;
  // A reaction only counts when there was a move to react to.
  const wantsReaction = Boolean(options.opponent);
  const retries = Number.isFinite(maxRetries) ? Math.min(3, Math.max(0, Math.trunc(maxRetries))) : 3;
  const totalCalls = 1 + retries;
  const reasons: string[] = [];
  let retryNote: string | undefined;

  for (let call = 1; call <= totalCalls; call++) {
    const result = await attempt(callModel, prompt, retryNote, offer.choices, options.signal, context);
    if ("move" in result) {
      const { move, index, explanation, reaction } = result;
      const verdict = options.opponent?.judgement?.verdict ?? null;
      return {
        ok: true,
        move,
        attempts: call,
        ...(options.engineFallback ? cue : {}),
        ...(explanation === undefined ? {} : { reason: checkReason(explanation) }),
        ...(!options.engineFallback && wantsReaction && reaction ? { reaction: checkReaction(reaction, options.level, verdict) } : {}),
        ...(offer.info && offer.scoreOf ? { lookahead: { ...offer.info, score: offer.scoreOf[index]! } } : {}),
      };
    }

    reasons.push(result.reason);
    if (options.engineFallback && (result.fallback || result.retryable === false || call === totalCalls)) return fallback(call);
    if (result.retryable === false) return { ok: false, reasons, attempts: call };
    retryNote = result.note;
    if (call < totalCalls) {
      const delay = Math.max((options.retryDelayMs ?? 0) * 2 ** (call - 1), result.retryAfterMs ?? 0);
      try {
        await waitToRetry(delay, options.signal);
      } catch (error) {
        reasons.push(error instanceof Error ? error.message : "The AI request was cancelled.");
        return { ok: false, reasons, attempts: call };
      }
    }
  }

  return { ok: false, reasons, attempts: totalCalls };
}
