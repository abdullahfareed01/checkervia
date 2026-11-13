import { memo } from "react";
import { RobotIcon } from "./icons";
import type { AiExplanation } from "./useAiExplanation";
import { WHY_PANEL_ID, WhyContent, hasWhy } from "./WhyContent";

interface AiMoveNoteProps {
  explanation: AiExplanation | null; // the AI move on screen, if any
  open: boolean; // "Why?" is open
  inline: boolean; // show the answer here (wide screens); phones use a sheet
  onToggle: () => void;
}

// The compact line in the side panel for the AI move on screen (Change 2):
// "AI played E3 → D4" and a small "Why?" button. Nothing about the AI's
// reasoning shows until "Why?" is pressed; on wide screens the answer opens
// right below. It follows the history, so reviewing an old AI move explains
// that move.
export const AiMoveNote = memo(function AiMoveNote({ explanation, open, inline, onToggle }: AiMoveNoteProps) {
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
            aria-controls={inline ? WHY_PANEL_ID : undefined}
            onClick={onToggle}
          >
            Why?
          </button>
        )}
      </p>
      {why && open && inline && (
        <div id={WHY_PANEL_ID} className="why-inline">
          <WhyContent explanation={explanation} />
        </div>
      )}
    </section>
  );
});
