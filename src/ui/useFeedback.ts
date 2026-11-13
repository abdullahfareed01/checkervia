// Connects the sound and haptics (feedback.ts) to the app, without touching
// the game state: everything is worked out from what the screen already
// shows, so the state layer stays pure and instant.
import { useEffect, useRef } from "react";
import { pieceAt } from "../engine";
import type { GameState } from "../state/gameReducer";
import { AI_PLAYER } from "../state/gameReducer";
import type { BubbleMessage } from "./ChatBubble";
import { moveFeedback, playFeedback } from "./feedback";
import { moveDuration } from "./moveGeometry";
import { prefersReducedMotion } from "./MovingPiece";
import { soundEngine } from "./sound/soundEngine";

let interacted = false;

/** True once the player has tapped, clicked or pressed a key on the page. */
export function hasInteracted(): boolean {
  return interacted;
}

/**
 * For the whole app: unlocks audio on the first tap or key press (browsers
 * only allow sound after one; iOS also suspends audio later, so every
 * gesture resumes it), and gives buttons and toggles their soft click.
 * Board squares are left out: the game gives them their own sounds.
 */
export function useInterfaceFeedback(): void {
  useEffect(() => {
    const unlock = () => {
      interacted = true;
      soundEngine().unlock();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button, [role='switch']") : null;
      if (!target || target.closest(".board") || (target as HTMLButtonElement).disabled) return;
      const toggle =
        target.getAttribute("role") === "switch" || target.hasAttribute("aria-pressed") || target.classList.contains("segment");
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

/** True when the move at `index` of the history made a King. */
export function madeKing(history: GameState["history"], index: number): boolean {
  const entry = history[index];
  const before = history[index - 1];
  if (!entry?.move || !before) return false;
  return pieceAt(before.board, entry.move.from)?.kind === "man" && pieceAt(entry.board, entry.move.to)?.kind === "king";
}

interface GameFeedbackInput {
  state: GameState;
  resultOpen: boolean;
  sheets: string; // which sheets are open, e.g. "menu why"; a change is a whoosh
  bubble: BubbleMessage | null;
}

/**
 * The game's sounds and vibrations that follow from what changed on screen:
 * a move landing (hop by hop, in step with the move animation), the AI
 * failing, the result panel appearing, a sheet opening or closing, and a new
 * line in the AI's bubble.
 */
export function useGameFeedback({ state, resultOpen, sheets, bubble }: GameFeedbackInput): void {
  // Moves: each landing sounds when the animated piece gets there.
  const moves = useRef(state.history.length);
  useEffect(() => {
    const grew = state.history.length === moves.current + 1;
    moves.current = state.history.length;
    const index = state.history.length - 1;
    const move = state.history[index]?.move;
    if (!grew || !move) return undefined;
    const beats = moveFeedback(move, madeKing(state.history, index));
    const hopMs = prefersReducedMotion() ? 0 : moveDuration(move) / move.path.length;
    const timers = beats.map((beat, i) =>
      setTimeout(() => playFeedback(beat.event, beat.options), Math.min(i + 1, move.path.length) * hopMs + (beat.event === "crown" ? 60 : 0)),
    );
    return () => timers.forEach(clearTimeout);
  }, [state.history.length]);

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
      playFeedback(state.mode === "vs-ai" && state.winner === AI_PLAYER ? "loss" : "win");
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
  const key = bubble && bubble.text !== null ? bubble.key : null;
  useEffect(() => {
    if (key && key !== lastBubble.current) playFeedback(key.startsWith("idle") ? "idleBubble" : "aiBubble");
    lastBubble.current = key;
  }, [key]);
}
