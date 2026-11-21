// The proxy rebuilds prompts from board/event data. Browser text is never
// forwarded, so names, profiles and arbitrary error messages cannot leak.
import { getLegalMoves } from "../engine";
import type { Board, Player } from "../engine";
import type { AiLevel } from "./difficulty";
import { AI_LEVELS } from "./difficulty";
import { buildPrompt, describeBoard } from "./prompt";
import { checkedReasons } from "./truth";
import type { ChatContext } from "./chat";

export type AiJob = "move" | "taunt";
export const TAUNT_EVENTS = ["during", "start", "rematch", "end", "idle", "resign"] as const;
export type TauntEvent = typeof TAUNT_EVENTS[number];
export interface ModelContext extends ChatContext {
  job: AiJob;
  board: Board;
  player: Player;
  level: AiLevel;
  opening: boolean;
  candidates: readonly number[]; // indexes in the engine's full legal list
  scores?: readonly number[];
  event?: TauntEvent;
}

export function readContext(value: unknown): ModelContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (Object.keys(c).some(k => !["job", "board", "player", "level", "opening", "candidates", "scores", "event", "verdict", "outcome", "humanMoves"].includes(k))) return null;
  if (c.job !== "move" && c.job !== "taunt") return null;
  if (c.player !== "black" && c.player !== "white") return null;
  if (![1, 2, 3, 4].includes(c.level as number) || typeof c.opening !== "boolean") return null;
  if (!Array.isArray(c.board) || c.board.length !== 8 || !c.board.every(row => Array.isArray(row) && row.length === 8 && row.every(p => p === null || (typeof p === "object" && p !== null && !Array.isArray(p) && Object.keys(p).every(k => k === "player" || k === "kind") && (p.player === "black" || p.player === "white") && (p.kind === "man" || p.kind === "king"))))) return null;
  const moves = getLegalMoves(c.board as Board, c.player);
  if (!Array.isArray(c.candidates) || c.candidates.length > moves.length || !c.candidates.every(i => Number.isInteger(i) && i >= 0 && i < moves.length) || new Set(c.candidates).size !== c.candidates.length) return null;
  if (c.job === "move" && c.candidates.length === 0) return null;
  if (c.scores !== undefined && (!Array.isArray(c.scores) || c.scores.length !== c.candidates.length || !c.scores.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e9))) return null;
  if (c.event !== undefined && !TAUNT_EVENTS.includes(c.event as TauntEvent)) return null;
  if (c.verdict !== undefined && c.verdict !== null && c.verdict !== "great" && c.verdict !== "blunder") return null;
  if (c.outcome !== undefined && !["ai-win", "human-win", "draw"].includes(c.outcome as string)) return null;
  if (c.humanMoves !== undefined && (!Number.isInteger(c.humanMoves) || (c.humanMoves as number) < 0 || (c.humanMoves as number) > 10_000)) return null;
  // A verdict is about the player's last move, so only a move reaction has one (D155).
  if (c.verdict !== undefined && c.verdict !== null && c.event !== undefined && c.event !== "during") return null;
  if (c.job === "move" && (c.verdict !== undefined || c.outcome !== undefined || c.humanMoves !== undefined)) return null;
  return c as unknown as ModelContext;
}

// What is true about the human's play, for the taunt (D155): whether they
// have moved, and the engine's verdict on their last move when it had one.
function playFacts(c: ModelContext): string {
  const moved = c.humanMoves === undefined ? "" : c.humanMoves === 0 ? "The human has not made a move yet in this game, so there is no play of theirs to talk about. " : `The human has made ${c.humanMoves} ${c.humanMoves === 1 ? "move" : "moves"} in this game. `;
  const during = c.event === undefined || c.event === "during";
  if (during && c.verdict === "blunder") return `${moved}The engine verified that the human's last move was a blunder: you may roast that move.`;
  if (during && c.verdict === "great") return `${moved}The engine verified that the human's last move was excellent: give grudging respect for it.`;
  if (c.outcome === "human-win") return `${moved}The human won this game.`;
  return `${moved}There is no engine verdict on the human's play: never judge their strategy, plan, attempts, mistakes, skill or patterns. Talk about yourself, the game or the board in general terms.`;
}

export function promptForContext(c: ModelContext): string {
  if (c.job === "taunt") return [
    'Reply only as JSON: {"reaction":"one short rival remark"}.',
    c.level === 4 ? "You are a relentless, cocky checkers rival, never sweet or encouraging. Brag about yourself; mock the human's play only after an engine verified blunder. Never mock real world traits. No friendly coaching." : c.level === 3 ? 'You are a cocky, competitive checkers rival. Keep it clean.' : c.level === 2 ? 'You are a playful, competitive checkers rival. Keep it clean.' : 'You are a warm, encouraging checkers rival. Keep it clean.',
    'At most 20 words and 140 characters. No threats, slurs, real world personal remarks or dashes. No profanity except mild words after a verified blunder at Strongest.',
    `You are ${c.player === "black" ? "Black" : "White"}. The human is ${c.player === "black" ? "White" : "Black"}. "I" means the AI; "you" means the human.`,
    'Do not mention colours, squares, piece counts, captures, kings, position advantage, or whose turn it is. The interface already announces the turn. Do not repeat a turn cue.',
    `Event: ${c.event ?? "during"}. Level: ${c.level}. Outcome: ${c.outcome ?? "game ongoing"}. Never invent a result.`,
    playFacts(c),
    c.verdict === "great" || c.outcome === "human-win" ? 'Give grudging respect for this verified achievement: the line must read as respect, with no taunt and no backhanded "nice try". At Strongest keep it terse, never gush.' : 'Do not praise the human or claim they played well. At Strongest, give only competitive banter about yourself.',
    describeBoard(c.board),
  ].join("\n");
  const legal = getLegalMoves(c.board, c.player);
  const depth = AI_LEVELS[c.level].depth;
  const moves = c.candidates.map(i => legal[i]!);
  const best = c.scores ? Math.max(...c.scores) : undefined;
  const facts = moves.map((move, index) => `${index + 1}: ${JSON.stringify(checkedReasons(c.board, move, c.player, legal.length, c.scores?.[index], best))}`).join("\n");
  return `${buildPrompt(c.board, c.player, moves, c.scores ? { depth, scores: c.scores } : undefined, undefined, legal.length)}\n\nSet reaction to an empty string; a separate request supplies the rival's line.\nFor reason, copy exactly one of the checked statements for your chosen candidate:\n${facts}`;
}

export class EngineFallbackError extends Error {
  constructor() { super("The engine will choose this move."); this.name = "EngineFallbackError"; }
}
