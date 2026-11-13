import { memo } from "react";
import { InfoIcon, RobotIcon, SparkleIcon } from "./icons";
import type { AiExplanation } from "./useAiExplanation";

interface AiMoveNoteProps {
  explanation: AiExplanation | null; // the AI move on screen, if any
  onWhy: () => void;
}

// A card under the board for the AI move on screen: what it played, and a
// "Why this move?" button (the info icon opens the same popup). The AI's own
// words appear in its speech bubble; this card stays after the bubble has
// gone. It follows the history, so reviewing an old AI move explains it.
export const AiMoveNote = memo(function AiMoveNote({ explanation, onWhy }: AiMoveNoteProps) {
  if (!explanation) return null;

  return (
    <section className="ai-note" aria-label="AI's move">
      <div className="ai-note-inner">
        <p className="ai-note-line">
          <span className="ai-note-avatar" aria-hidden="true">
            <RobotIcon />
          </span>
          <span className="ai-note-move">AI played {explanation.label}</span>
          <button type="button" className="ai-note-info" aria-label="About this move" onClick={onWhy}>
            <InfoIcon />
          </button>
        </p>
        <button type="button" className="ai-note-button" onClick={onWhy}>
          <SparkleIcon />
          Why this move?
        </button>
      </div>
    </section>
  );
});
