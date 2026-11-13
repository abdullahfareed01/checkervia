import { memo } from "react";
import { RobotIcon } from "./icons";
import type { AiExplanation } from "./useAiExplanation";
import { WHY_PANEL_ID, hasWhy } from "./WhyContent";

interface AiMoveNoteProps {
  explanation: AiExplanation | null; // the AI move on screen, if any
  open: boolean; // "Why?" is open (the answer floats above the page)
  onToggle: () => void;
}

// The compact line in the side panel for the AI move on screen (Change 2):
// "AI played E3 → D4" and a small "Why?" button. Nothing about the AI's
// reasoning shows until "Why?" is pressed, and then it opens as a card
// floating above the page, so the side panel never grows. It follows the history, so reviewing an old AI move explains
// that move.
export const AiMoveNote = memo(function AiMoveNote({ explanation, open, onToggle }: AiMoveNoteProps) {
  if (!explanation) return null;
  const why = hasWhy(explanation);

  return (
    <section className="ai-note" aria-label="AI's move">
      <p className="ai-note-line">
        <span className="ai-note-avatar" aria-hidden="true">
          <RobotIcon />
        </span>
        <span className="ai-note-move">AI played {explanation.label}</span>
        {why && (
          <button
            type="button"
            className="why-button"
            aria-expanded={open}
            aria-controls={WHY_PANEL_ID}
            onClick={onToggle}
          >
            Why?
          </button>
        )}
      </p>
    </section>
  );
});
