import type { AiLevel } from "./difficulty";
import type { Verdict } from "./judge";
import { checkReaction, classify } from "./language";

export interface ChatContext {
  level: AiLevel;
  verdict?: Verdict | null;
  outcome?: "ai-win" | "human-win" | "draw";
  // How many moves the human has made this game (D155). Zero means they have
  // not moved yet, so there is nothing about their play to talk about.
  humanMoves?: number;
}

const HUMAN_TURNS = ["My move. Your turn!", "Over to you.", "You are up.", "Your move. Make it count.", "The board is yours.", "On you now.", "Your turn. Show me your plan.", "All yours. Pick your next move."];
const STRONG_TURNS = ["My move. Your turn!", "On you. Make it worth my time.", "Your move. No excuses.", "You are up. Try a real plan.", "Your turn. Impress me for once.", "Over to you. Keep up.", "Your move. Show some fight.", "On you. Less staring, more strategy."];
const AI_TURNS = ["My turn. Watch closely.", "Over to me.", "Let me think.", "My move next.", "I am up. Give me a moment.", "Time for my reply."];
// After an ordinary move there is no engine verdict, so these talk about the
// AI and the game, never about the player's play (D155).
const PLAIN = ["Let us see where this goes.", "There is more to this game yet.", "I am enjoying this one.", "I am curious what comes next.", "Every decision counts.", "This is getting interesting."];
const FIERCE = ["I am just getting started.", "I already know my next three replies.", "I came for a challenge. I brought my best.", "I am not here to hand out compliments.", "Watch closely. I do not miss.", "This board belongs to me.", "I have patience. My mercy is another matter.", "Nobody outplays me twice."];
const RESPECT = ["Fine. That earned a nod. Do not get used to it.", "Credit where it is due. Now keep it up.", "That was sharp. I am still not going easy."];
const SLIPS = ["That was a gift. I will take it.", "You gave me an opening. No refunds.", "That plan needed another look."];
const pick = (lines: readonly string[], seed: number) => lines[Math.abs(Math.trunc(seed)) % lines.length]!;

export function turnLine(side: "ai" | "human", level: AiLevel, seed: number): string {
  return pick(side === "ai" ? AI_TURNS : level === 4 ? STRONG_TURNS : HUMAN_TURNS, seed);
}

export function localChatLine(level: AiLevel, seed: number, verdict: Verdict | null = null): string {
  if (verdict === "great") return pick(RESPECT, seed);
  if (verdict === "blunder") return pick(SLIPS, seed);
  return pick(level === 4 ? FIERCE : PLAIN, seed);
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

/** True when `line` judges the player's play (or insults the player). */
export function judgesPlay(line: string): boolean {
  return PLAY_CLAIM.test(line) || classify(line).includes("insult");
}

export function validChatLine(line: string, context: ChatContext = { level: 1 }): boolean {
  if (!line.trim() || line.length > 140 || line.trim().split(/\s+/).length > 20 || /[-\u2013\u2014]/.test(line)) return false;
  if (checkReaction(line, context.level, context.verdict ?? null) !== line || BOARD_CLAIM.test(line) || TURN_CLAIM.test(line)) return false;
  // The current UI supplies an explicit verdict (null for an ordinary move)
  // and already gave the turn cue. Keep older direct taunt callers compatible.
  if ((context.verdict !== undefined || context.outcome !== undefined) && /\byour (?:move|turn)\b|\bon you\b|\byou(?: are|'re|’re) up\b/i.test(line)) return false;
  if (context.level === 4 && context.verdict !== "great" && context.outcome !== "human-win" && PRAISE.test(line)) return false;
  const verified = context.verdict === "blunder" || context.verdict === "great" || context.outcome === "human-win";
  if (!verified && judgesPlay(line)) return false;
  if (AI_WIN.test(line) && context.outcome !== "ai-win") return false;
  if (HUMAN_WIN.test(line) && context.outcome !== "human-win") return false;
  if (/\b(?:a draw|drawn game|game over|it is over|it's over|it’s over)\b/i.test(line) && !context.outcome) return false;
  if (/\b(?:a draw|drawn game)\b/i.test(line) && context.outcome !== "draw") return false;
  return true;
}
