import type { AiLevel } from "./difficulty";
import type { Verdict } from "./judge";
import { checkReaction } from "./language";

export interface ChatContext {
  level: AiLevel;
  verdict?: Verdict | null;
  outcome?: "ai-win" | "human-win" | "draw";
}

const HUMAN_TURNS = ["My move. Your turn!", "Over to you.", "You are up.", "Your move. Make it count.", "The board is yours.", "On you now.", "Your turn. Show me your plan.", "All yours. Pick your next move."];
const STRONG_TURNS = ["My move. Your turn!", "On you. Make it worth my time.", "Your move. No excuses.", "You are up. Try a real plan.", "Your turn. Impress me for once.", "Over to you. Keep up.", "Your move. Show some fight.", "On you. Less staring, more strategy."];
const AI_TURNS = ["My turn. Watch closely.", "Over to me.", "Let me think.", "My move next.", "I am up. Give me a moment.", "Time for my reply."];
const PLAIN = ["Let us see your next idea.", "There is more to this game yet.", "Keep your next idea ready.", "I am curious what you try next.", "Every decision counts.", "Bring your best plan."];
const FIERCE = ["Show me a plan worth noticing.", "That stare is not a strategy.", "I came for a challenge. Prove you are one.", "I am not here to hand out compliments.", "Less hesitation. More fight.", "Bring something better than wishful thinking.", "I have patience. My mercy is another matter.", "Make me work for it, amateur."];
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

export function validChatLine(line: string, context: ChatContext = { level: 1 }): boolean {
  if (!line.trim() || line.length > 140 || line.trim().split(/\s+/).length > 20 || /[-\u2013\u2014]/.test(line)) return false;
  if (checkReaction(line, context.level, context.verdict ?? null) !== line || BOARD_CLAIM.test(line) || TURN_CLAIM.test(line)) return false;
  // The current UI supplies an explicit verdict (null for an ordinary move)
  // and already gave the turn cue. Keep older direct taunt callers compatible.
  if ((context.verdict !== undefined || context.outcome !== undefined) && /\byour (?:move|turn)\b|\bon you\b|\byou(?: are|'re|’re) up\b/i.test(line)) return false;
  if (context.level === 4 && context.verdict !== "great" && context.outcome !== "human-win" && PRAISE.test(line)) return false;
  if (AI_WIN.test(line) && context.outcome !== "ai-win") return false;
  if (HUMAN_WIN.test(line) && context.outcome !== "human-win") return false;
  if (/\b(?:a draw|drawn game|game over|it is over|it's over|it’s over)\b/i.test(line) && !context.outcome) return false;
  if (/\b(?:a draw|drawn game)\b/i.test(line) && context.outcome !== "draw") return false;
  return true;
}
