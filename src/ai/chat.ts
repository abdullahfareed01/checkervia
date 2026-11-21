import type { AiLevel } from "./difficulty";
import type { Verdict } from "./judge";
import { checkReaction, classify } from "./language";
import { AI_CUES, CHAT_LINES } from "./chatLines";
import type { ChatList } from "./chatLines";

export interface ChatContext {
  level: AiLevel;
  verdict?: Verdict | null;
  outcome?: "ai-win" | "human-win" | "draw";
  // How many moves the human has made this game (D155). Zero means they have
  // not moved yet, so there is nothing about their play to talk about.
  humanMoves?: number;
  // The AI's last few final lines this tab (D159): a new line may not repeat one.
  recentLines?: readonly string[];
  // How a finished game ended, and whether the engine verified a blunder by
  // the player in it (D160), for the line at the end.
  ending?: GameEnding;
  blunderSeen?: boolean;
}

export const GAME_ENDINGS = ["playerWon", "aiWon", "resigned", "abandoned", "aiResigned", "stubborn", "draw"] as const;
export type GameEnding = (typeof GAME_ENDINGS)[number];

/** Picks one of `lines`; `list` names the list, so a picker can remember it (D161). */
export type PickLine = (list: string, lines: readonly string[]) => string;

/** Line `seed` modulo the length: the same line for the same seed (tests). */
export const seededPick = (seed: number): PickLine => (_list, lines) => lines[Math.abs(Math.trunc(seed)) % lines.length]!;

/** Which local list follows a move with this engine verdict. */
export function chatListFor(verdict: Verdict | null): ChatList {
  return verdict === "great" ? "respect" : verdict === "blunder" ? "slip" : "ordinary";
}

/** The turn cue: the AI's own while it thinks, the level's after its move. */
export function turnLine(side: "ai" | "human", level: AiLevel, seed: number, pick: PickLine = seededPick(seed)): string {
  return side === "ai" ? pick("cue:ai", AI_CUES) : pick(`cue:${level}`, CHAT_LINES[level].cue);
}

/** The local line after an AI move, from the list for the engine's verdict. */
export function localChatLine(level: AiLevel, seed: number, verdict: Verdict | null = null, pick: PickLine = seededPick(seed)): string {
  const list = chatListFor(verdict);
  return pick(`${list}:${level}`, CHAT_LINES[level][list]);
}

// Chatter is not an explanation. Keep board facts and whose turn it is in
// engine-owned UI, where colour swaps and rotated boards cannot confuse it.
const BOARD_CLAIM = /\b(?:black|white|pieces?|pawns?|kings?|captur(?:e|es|ed|ing)|[a-h][1-8]|\d+)\b|\b(?:(?:dark|light) (?:side|army)|forced (?:win|loss)|no legal moves|(?:I am|I'm|I’m|you are|you're|you’re) (?:winning|losing|ahead))\b/i;
const TURN_CLAIM = /\bmy (?:move|turn)\b|\b(?:I am|I'm|I’m) (?:up|thinking)\b/i;
const PRAISE = /\b(?:nice|well played|good|great|excellent|brilliant|clever|impressive|impressed|amazing|awesome|wonderful|love|loving|proud|respect|strong|smart|sharp|talented|skilled|outstanding|superb|fantastic|beautiful|lovely|solid|congratulations|congrats|champion|have fun|you got this|getting better|way to go)\b/i;
const AI_WIN = /\b(?:I (?:win|won|beat you)|you (?:lose|lost)|my victory|you resign(?:ed)?)\b/i;
const HUMAN_WIN = /\b(?:you (?:win|won|beat me)|I (?:lose|lost)|your victory|I resign(?:ed)?)\b/i;

// Words that judge the player's play: its plan, attempts, mistakes, skill
// or patterns. Only an engine verdict may back them (D155): a blunder for a
// roast, a great move or the player's win for respect. Insults judge the
// player too, so they follow the same rule.
const PLAY_CLAIM = /\b(?:plans?|planned|planning|strateg(?:y|ies|ic)|attempts?|mistakes?|errors?|traps?|trapped|predictable|again|same old|blunder(?:s|ed|ing)?|slip(?:s|ped)?|sloppy|careless|clumsy|reckless|desperate|habits?|patterns?|loops?|outdated|skills?|unskilled|weak(?:ness)?|flaw(?:s|ed)?|barely|disaster|(?<!good )luck|lucky|fluke|nice try|that move|those moves|your last move|your (?:play|playing|game|idea|ideas|thinking|tactics?|defen[cs]e|attack|choices?|decisions?)|you keep|you always|every time|rookie|beginner)\b/i;

// Praise of the player or their play, at every level (D157). Greetings
// like "good luck" or "nice to meet you" are not praise.
const PLAYER_PRAISE = /\b(?:(?:good|great|nice|strong|smart|clever|solid|excellent|brilliant|beautiful|lovely|fine) (?:move|moves|play|job|one|choice|idea|plan|shot|thinking|work|effort)|well (?:played|done)|nice(?! try| to)|excellent|brilliant|clever|impressive|impressed|amazing|awesome|wonderful|proud of you|respect|sharp|talented|skilled|outstanding|superb|fantastic|congratulations|congrats|champion|getting better|way to go|you(?: are|'re|’re) (?:good|great|strong|smart|skilled|talented|a natural|doing (?:great|well)))\b/i;

// What a line of respect says, and what turns it into a taunt (D157): the
// "Respect" chip may only sit above a line that reads as respect.
const RESPECT_WORDS = /\b(?:respect|well played|well done|(?:nice|good|great|fine|strong) (?:move|one|play|game|job|shot|work)|sharp|clever|brilliant|excellent|impressive|impressed|solid|credit|nod|earned|deserved|fair (?:enough|and square)|not bad|you got me|got me there|you beat me|you won|outplayed me|did not see|didn't see|didn’t see|bravo|hats off|kudos|props|i admit|i will admit|i'll admit|good game|congratulations|congrats|that worked)\b/i;
const ROAST_WORDS = /\b(?:nice try|predictable|outdated|stuck|loops?|weak|sloppy|careless|lucky|luck|fluke|gift|mistakes?|blunder\w*|slip\w*|traps?|fail\w*|wasted|wrong|bad|poor|worse|worst|doomed|barely|pathetic|not enough|too late|desperate|clumsy|for once)\b/i;

/** True when `line` praises the player or their play. */
export function praisesPlayer(line: string): boolean {
  return PLAYER_PRAISE.test(line);
}

/** True when `line` reads as respect: respect words, no taunt, no insult. */
export function readsAsRespect(line: string): boolean {
  return RESPECT_WORDS.test(line) && !ROAST_WORDS.test(line) && !classify(line).includes("insult");
}

/** True when `line` judges the player's play (or insults the player). */
export function judgesPlay(line: string): boolean {
  return PLAY_CLAIM.test(line) || classify(line).includes("insult");
}

/**
 * A model line in the form players see (D158): curly quotes made straight,
 * quotes around the whole line or around one word removed ("Your 'move'" is
 * "Your move"), spaces tidied and the first letter a capital. Every rule
 * below reads this form, so quotes cannot hide a word from them.
 */
export function normaliseLine(line: string): string {
  let text = line.replace(/[\u2018\u2019\u201b\u2032]/g, "'").replace(/[\u201c\u201d\u201f\u2033]/g, '"').replace(/\s+/g, " ").trim();
  const wrapped = /^(["'])(.*)\1$/.exec(text);
  if (wrapped && !wrapped[2]!.includes(wrapped[1]!)) text = wrapped[2]!.trim();
  text = text.replace(/(^|[\s(])(["'])([\p{L}\p{N}]+)\2(?=[\s.,!?;:)]|$)/gu, "$1$3");
  return text.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
}

// Quotes left after normalising: a double quote, or a single quote that is
// not an apostrophe inside a word ("you're" is fine).
const STRAY_QUOTE = /"|(?:^|[^\p{L}])'|'(?!\p{L})/u;
// "Oh you." in place of the turn cue "On you." (the audit's evasion).
const TURN_EVASION = /(?:^|[.!?]\s*)(?:oh|0n),? you(?:[.!?]|$)/i;

// A line compared without case, spaces or punctuation.
const plainWords = (line: string) => normaliseLine(line).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function validChatLine(raw: string, context: ChatContext = { level: 1 }): boolean {
  const line = normaliseLine(raw);
  if (STRAY_QUOTE.test(line)) return false;
  // Variety (D159): never a recent line again, never the stale "Nice try" opener.
  if (/^nice try\b/i.test(line) || context.recentLines?.some((recent) => plainWords(recent) === plainWords(line))) return false;
  if (!line.trim() || line.length > 140 || line.trim().split(/\s+/).length > 20 || /[-\u2013\u2014]/.test(line)) return false;
  if (checkReaction(line, context.level, context.verdict ?? null) !== line || BOARD_CLAIM.test(line) || TURN_CLAIM.test(line)) return false;
  // The current UI supplies an explicit verdict (null for an ordinary move)
  // and already gave the turn cue. Keep older direct taunt callers compatible.
  if ((context.verdict !== undefined || context.outcome !== undefined) && (/\byour (?:move|turn|go)\b|\bon you\b|\bover to you\b|\byou(?: are|'re) up\b/i.test(line) || TURN_EVASION.test(line))) return false;
  if (context.level === 4 && context.verdict !== "great" && context.outcome !== "human-win" && PRAISE.test(line)) return false;
  const verified = context.verdict === "blunder" || context.verdict === "great" || context.outcome === "human-win" || context.blunderSeen === true;
  if (!verified && judgesPlay(line)) return false;
  // The chip and the words agree (D157): praise only for a great move or the
  // player's win, and then the line must read as respect.
  const respectDue = context.verdict === "great" || context.outcome === "human-win";
  if (!respectDue && praisesPlayer(line)) return false;
  if (respectDue && !readsAsRespect(line)) return false;
  if (AI_WIN.test(line) && context.outcome !== "ai-win") return false;
  if (HUMAN_WIN.test(line) && context.outcome !== "human-win") return false;
  if (/\b(?:a draw|drawn game|game over|it is over|it's over|it’s over)\b/i.test(line) && !context.outcome) return false;
  if (/\b(?:a draw|drawn game)\b/i.test(line) && context.outcome !== "draw") return false;
  return true;
}
