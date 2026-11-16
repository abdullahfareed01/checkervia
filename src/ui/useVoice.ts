// Connects the AI's voice (voice/voiceEngine.ts) to the game. It reads
// exactly what is on screen, and only the kinds of message the player chose:
// the AI's reaction lines, greetings, idle lines, the game over taunt, and
// the Why and Tips content. Speech stops when the player starts their next
// move, on a new game or a mode or level change, when the page is hidden,
// and when the voice is turned off.
import { useCallback, useEffect, useRef } from "react";
import type { AiLevel } from "../ai";
import type { BubbleMessage } from "./ChatBubble";
import { settingsStore, useSettings } from "./settings";
import type { Settings } from "./settings";
import { voiceEngine } from "./voice/voiceEngine";

export type SpokenKind = keyof Settings["voice"]["read"];

/** Which reading switch a bubble line falls under (null: never read). */
export function bubbleKind(message: BubbleMessage | null): SpokenKind | null {
  if (!message || message.text === null) return null; // typing dots
  if (message.key === "greeting") return "greetings";
  if (message.key.startsWith("idle")) return "idle";
  return "reactions"; // a line after an AI move, or the resign hint
}

/**
 * Speaks `text` if the voice and this kind of message are switched on.
 * Muted chat (D88: Show chat bubbles off, or the mute button in focus mode)
 * silences the AI's own lines too; the Why card and the tips, which the
 * player asks for, are still read.
 */
export function speakIf(kind: SpokenKind, text: string, level: AiLevel): boolean {
  const { voice, chat } = settingsStore().get();
  if (!chat.bubbles && kind !== "tips") return false;
  return voice.read[kind] ? voiceEngine().speak(text, level, voice) : false;
}

interface VoiceInput {
  bubble: BubbleMessage | null; // what the AI's bubble shows now
  level: AiLevel;
  startedMove: boolean; // the player picked up a piece
  endLine: string | null; // the taunt on the result panel, once it is open
  why: string | null; // the Why card's text, while it is open
}

export function useVoice({ bubble, level, startedMove, endLine, why }: VoiceInput): void {
  const settings = useSettings();
  const enabled = settings.voice.enabled;
  const muted = !settings.chat.bubbles;

  // A new line in the bubble (not the typing dots: the line only appears
  // once the AI's piece has landed, so the voice never talks over a move).
  const kind = bubbleKind(bubble);
  const key = kind ? bubble!.key : null;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (key && key !== lastKey.current && kind) speakIf(kind, bubble!.text!, level);
    lastKey.current = key;
  }, [key]);

  // The game over taunt, when the panel shows it.
  useEffect(() => {
    if (endLine) speakIf("gameOver", endLine, level);
  }, [endLine]);

  // The Why card, when it opens (with the Tips and Why switch).
  useEffect(() => {
    if (why) speakIf("tips", why, level);
  }, [why]);

  // The player's next move, the voice switched off or the chat muted: stop at once.
  useEffect(() => {
    if (startedMove || !enabled || muted) voiceEngine().cancel();
  }, [startedMove, enabled, muted]);

  // Hiding the page stops the voice; leaving the game too.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) voiceEngine().cancel();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      voiceEngine().cancel();
    };
  }, []);
}

/** For the result panel's tips (read with the Tips and Why switch). */
export function useSpeakTips(level: AiLevel): (tips: readonly string[]) => void {
  return useCallback((tips: readonly string[]) => void speakIf("tips", tips.join(". "), level), [level]);
}
