// Connects the sound and haptics (feedback.ts) to the app, without touching
// the game state: everything is worked out from what the screen already
// shows, so the state layer stays pure and instant.
import { useEffect, useRef } from "react";
import type { GameState } from "../state/gameReducer";
import { aiSideOf } from "../state/gameReducer";
import type { BubbleMessage } from "./ChatBubble";
import { playFeedback } from "./feedback";
import { markInteracted } from "./interaction";
import { settingsStore } from "./settings";
import { soundEngine } from "./sound/soundEngine";
import { voiceEngine } from "./voice/voiceEngine";

/**
 * For the whole app: unlocks audio on the first tap or key press (browsers
 * only allow sound after one; iOS also suspends audio later, so every
 * gesture resumes it), and gives buttons and toggles their soft click.
 * Board squares are left out: the game gives them their own sounds.
 */
export function useInterfaceFeedback(): void {
  useEffect(() => {
    const unlock = () => {
      markInteracted();
      soundEngine().unlock();
      // iOS only allows speech after a tap: warm the voice up inside one.
      if (settingsStore().get().voice.enabled) voiceEngine().unlock();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button, [role='switch'], input[type='radio'], input[type='checkbox']") : null;
      if (!target || target.closest(".board") || (target as HTMLButtonElement).disabled) return;
      const toggle =
        target.getAttribute("role") === "switch" ||
        target.hasAttribute("aria-pressed") ||
        target.classList.contains("segment") ||
        target.matches("input[type='radio'], input[type='checkbox']");
      playFeedback(toggle ? "toggle" : "button");
    };
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
}

interface GameFeedbackInput {
  state: GameState;
  resultOpen: boolean;
  sheets: string; // which sheets are open, e.g. "menu why"; a change is a whoosh
  bubble: BubbleMessage | null;
}

/**
 * The game's sounds and vibrations that follow from what changed on screen:
 * the AI failing, the result panel appearing, a sheet opening or closing,
 * and a new line in the AI's bubble. (Moves sound at each landing, from the
 * move animation: Board's onMoveBeat.)
 */
export function useGameFeedback({ state, resultOpen, sheets, bubble }: GameFeedbackInput): void {
  // The AI could not move.
  const failed = state.aiPhase === "failed";
  const wasFailed = useRef(failed);
  useEffect(() => {
    if (failed && !wasFailed.current) playFeedback("error");
    wasFailed.current = failed;
  }, [failed]);

  // The result panel: a win or a loss when it appears.
  const wasOpen = useRef(resultOpen);
  useEffect(() => {
    if (resultOpen && !wasOpen.current && state.winner) {
      playFeedback(state.mode === "vs-ai" && state.winner === aiSideOf(state) ? "loss" : "win");
    }
    wasOpen.current = resultOpen;
  }, [resultOpen]);

  // Sheets opening and closing.
  const lastSheets = useRef(sheets);
  useEffect(() => {
    if (sheets !== lastSheets.current) playFeedback("sheet");
    lastSheets.current = sheets;
  }, [sheets]);

  // A new line in the AI's bubble (not the typing dots).
  const lastBubble = useRef<string | null>(null);
  const key = bubble && bubble.text !== null && bubble.announce !== false ? bubble.key : null;
  useEffect(() => {
    if (key && key !== lastBubble.current) playFeedback(key.startsWith("idle") ? "idleBubble" : "aiBubble");
    lastBubble.current = key;
  }, [key]);
}
