import { useEffect, useRef, useState } from "react";
import type { GameState } from "../state/gameReducer";
import { aiSideOf } from "../state/gameReducer";
import { requestTaunt, tauntEvent } from "../ai/taunt";
import { localChatLine, turnLine } from "../ai/chat";
import type { ModelContext } from "../ai/request";
import type { BubbleMessage } from "./ChatBubble";
import { deliverChat, TURN_CUE_MS } from "./chatDelivery";
import type { ChatFrame } from "./chatDelivery";

export function chatContext(state: GameState, key: string, rematch = false): ModelContext {
  const verdict = key.startsWith("move-") ? state.history.at(-1)?.judgement?.verdict ?? null : null;
  const outcome = state.drawn ? "draw" : state.winner ? state.winner === aiSideOf(state) ? "ai-win" : "human-win" : undefined;
  return { job: "taunt", board: state.board, player: aiSideOf(state), level: state.aiLevel, opening: false, candidates: [], event: tauntEvent(key, rematch), verdict, ...(outcome ? { outcome } : {}) };
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
      if (frame.phase === "final") sealed.current = next;
      setShown(next);
    };
    if (waiting) {
      show({ phase: "cue", text: cue });
      const timer = setTimeout(() => show({ phase: "typing", text: null }), TURN_CUE_MS);
      return () => clearTimeout(timer);
    }
    if (!local) return undefined;
    return deliverChat(cue, local, enabled && state.mode === "vs-ai" && state.viewIndex === null ? signal => requestTaunt(chatContext(state, key, rematch), signal) : null, show);
  }, [game, turn, key, local, enabled, rematch, state.aiLevel, cue, waiting]);
  if (matches(sealed.current)) return sealed.current!;
  return matches(shown) && shown!.cue === cue && shown!.waiting === waiting ? shown! : { phase: cue ? "cue" : "typing", text: cue };
}

// Pick one result line before showing it, rather than replacing a spoken line.
export function useRemoteLine(state: GameState, key: string, local: string | null, enabled: boolean, rematch = false): string | null {
  return useDeliveredLine(state, key, local, enabled, rematch).text;
}

export function useRemoteBubble(state: GameState, bubble: BubbleMessage | null, rematch: boolean): BubbleMessage | null {
  const key = bubble?.key ?? "";
  const warning = key.startsWith("push-") || key.startsWith("hint-") || (key.startsWith("idle-") && Number(key.split("-").at(-1)) >= 6);
  const move = key.startsWith("move-");
  const engineLine = move && state.history.at(-1)?.lookahead?.source === "engine";
  const thinking = key.startsWith("thinking-") && state.aiPhase === "thinking";
  const fallback = warning ? null : move ? localChatLine(state.aiLevel, state.aiRequestId, state.history.at(-1)?.judgement?.verdict ?? null) : bubble?.text ?? null;
  const cue = thinking ? turnLine("ai", state.aiLevel, state.aiRequestId) : move ? turnLine("human", state.aiLevel, state.aiRequestId) : null;
  const frame = useDeliveredLine(state, key, fallback, !warning && !engineLine, rematch, cue, thinking);
  if (!bubble || warning) return bubble;
  return { ...bubble, text: frame.text, tone: frame.phase === "final" ? bubble.tone : "banter", why: frame.phase === "final" && bubble.why, announce: frame.phase === "final" ? bubble.announce : false };
}
