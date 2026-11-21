import { useEffect, useRef, useState } from "react";
import type { GameState } from "../state/gameReducer";
import { aiSideOf } from "../state/gameReducer";
import { requestTaunt, tauntEvent } from "../ai/taunt";
import { localChatLine, turnLine } from "../ai/chat";
import type { ModelContext } from "../ai/request";
import type { BubbleMessage } from "./ChatBubble";
import { deliverChat, TURN_CUE_MS } from "./chatDelivery";
import type { ChatFrame } from "./chatDelivery";
import { readShownLines, rememberShownLine } from "./shownLines";

export function chatContext(state: GameState, key: string, rematch = false, recentLines: readonly string[] = []): ModelContext {
  const verdict = key.startsWith("move-") ? state.history.at(-1)?.judgement?.verdict ?? null : null;
  const outcome = state.drawn ? "draw" : state.winner ? state.winner === aiSideOf(state) ? "ai-win" : "human-win" : undefined;
  // The player's moves so far: zero means nothing about their play is true yet (D155).
  const humanMoves = state.history.filter((entry) => entry.player === state.humanSide).length;
  return { job: "taunt", board: state.board, player: aiSideOf(state), level: state.aiLevel, opening: false, candidates: [], event: tauntEvent(key, rematch), verdict, humanMoves, ...(outcome ? { outcome } : {}), ...(recentLines.length ? { recentLines: recentLines.slice(-3) } : {}) };
}

interface Delivery extends ChatFrame { game: GameState["history"][number] | undefined; turn: number; key: string; cue: string | null; waiting: boolean }
function useDeliveredLine(state: GameState, key: string, local: string | null, enabled: boolean, rematch: boolean, cue: string | null = null, waiting = false): ChatFrame {
  const game = state.history[0], turn = state.aiRequestId;
  const [shown, setShown] = useState<Delivery | null>(null);
  const sealed = useRef<Delivery | null>(null);
  const matches = (entry: Delivery | null) => entry !== null && entry.game === game && entry.turn === turn && entry.key === key;
  useEffect(() => {
    if (matches(sealed.current)) return undefined;
    const show = (frame: ChatFrame) => {
      const next = { ...frame, game, turn, key, cue, waiting };
      if (frame.phase === "final") {
        sealed.current = next;
        if (frame.text) rememberShownLine(frame.text);
      }
      setShown(next);
    };
    if (waiting) {
      show({ phase: "cue", text: cue });
      const timer = setTimeout(() => show({ phase: "typing", text: null }), TURN_CUE_MS);
      return () => clearTimeout(timer);
    }
    if (!local) return undefined;
    return deliverChat(cue, local, enabled && state.mode === "vs-ai" && state.viewIndex === null ? signal => requestTaunt(chatContext(state, key, rematch, readShownLines()), signal) : null, show);
  }, [game, turn, key, local, enabled, rematch, state.aiLevel, cue, waiting]);
  if (matches(sealed.current)) return sealed.current!;
  return matches(shown) && shown!.cue === cue && shown!.waiting === waiting ? shown! : { phase: cue ? "cue" : "typing", text: cue };
}

// Pick one result line before showing it, rather than replacing a spoken line.
export function useRemoteLine(state: GameState, key: string, local: string | null, enabled: boolean, rematch = false): string | null {
  return useDeliveredLine(state, key, local, enabled, rematch).text;
}

/** How one bubble is delivered: what shows first, the local line, and whether the model is asked. */
export interface BubblePlan {
  readonly passThrough: boolean; // shown exactly as given (no bubble, a warning or an idle line)
  readonly fallback: string | null; // the local line, shown when the model gives none
  readonly cue: string | null; // the turn cue shown before the dots
  readonly waiting: boolean; // the AI is thinking: cue, then dots, no final line yet
  readonly asksModel: boolean;
}

// Pure, so the choice can be tested without a browser.
export function bubblePlan(state: GameState, bubble: BubbleMessage | null): BubblePlan {
  const key = bubble?.key ?? "";
  // Warnings keep their exact local words; idle lines stay local too (D73,
  // D82, restored by D156): the model was inventing the player's past play.
  const local = key.startsWith("push-") || key.startsWith("hint-") || key.startsWith("idle-");
  const move = key.startsWith("move-");
  const engineLine = move && state.history.at(-1)?.lookahead?.source === "engine";
  // The AI's opening greeting (D85, D154) is its own bank's line: it says the
  // AI moved first, which the model is never told.
  const aiOpening = key === "greeting" && state.history.length > 1;
  const thinking = key.startsWith("thinking-") && state.aiPhase === "thinking";
  const fallback = local ? null : move ? localChatLine(state.aiLevel, state.aiRequestId, state.history.at(-1)?.judgement?.verdict ?? null) : bubble?.text ?? null;
  const cue = thinking ? turnLine("ai", state.aiLevel, state.aiRequestId) : move ? turnLine("human", state.aiLevel, state.aiRequestId) : null;
  return { passThrough: !bubble || local, fallback, cue, waiting: thinking, asksModel: !local && !engineLine && !aiOpening };
}

export function useRemoteBubble(state: GameState, bubble: BubbleMessage | null, rematch: boolean): BubbleMessage | null {
  const plan = bubblePlan(state, bubble);
  const frame = useDeliveredLine(state, bubble?.key ?? "", plan.fallback, plan.asksModel, rematch, plan.cue, plan.waiting);
  if (!bubble || plan.passThrough) return bubble;
  return { ...bubble, text: frame.text, tone: frame.phase === "final" ? bubble.tone : "banter", why: frame.phase === "final" && bubble.why, announce: frame.phase === "final" ? bubble.announce : false };
}
