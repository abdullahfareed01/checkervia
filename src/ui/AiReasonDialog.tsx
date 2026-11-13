import { useEffect, useRef } from "react";
import type { FactLine } from "../state/moveFacts";
import { RobotIcon } from "./icons";

interface AiReasonDialogProps {
  moveLabel: string; // e.g. "3,2 → 4,1"
  moveNumber: number;
  reason: string | null; // the model's own words, or null if it gave none
  facts: readonly FactLine[]; // worked out by the engine
  onClose: () => void;
}

const FACT_MARKS: Record<FactLine["tone"], string> = { good: "✓", bad: "!", info: "•" };

// The engine-checked facts as a list, each marked good, risky or neutral.
export function FactList({ facts }: { facts: readonly FactLine[] }) {
  return (
    <ul className="ai-facts">
      {facts.map((fact) => (
        <li key={fact.text} className={`ai-fact ai-fact-${fact.tone}`}>
          <span className="ai-fact-mark" aria-hidden="true">
            {FACT_MARKS[fact.tone]}
          </span>
          {fact.text}
        </li>
      ))}
    </ul>
  );
}

// Popup explaining one AI move: what the model said about it (not checked),
// and what the rules engine can prove about it. The model's text is rendered
// as plain text only, never as HTML.
export function AiReasonDialog({ moveLabel, moveNumber, reason, facts, onClose }: AiReasonDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Put the keyboard on the close button when the popup opens.
  useEffect(() => closeRef.current?.focus(), []);

  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        className="ai-reason"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-reason-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header className="ai-reason-head">
          <span className="ai-reason-avatar" aria-hidden="true">
            <RobotIcon />
          </span>
          <div>
            <h2 id="ai-reason-title" className="ai-reason-title">
              Why the AI played this
            </h2>
            <p className="ai-reason-move">
              Move {moveNumber}: {moveLabel}
            </p>
          </div>
        </header>

        <section className="ai-reason-section" aria-labelledby="ai-reason-words">
          <h3 id="ai-reason-words">In its own words</h3>
          {reason ? (
            <blockquote className="ai-reason-quote">{reason}</blockquote>
          ) : (
            <p className="ai-reason-empty">The model gave no reason for this move.</p>
          )}
          <p className="ai-reason-caption">Written by the language model. The game does not check it.</p>
        </section>

        <section className="ai-reason-section" aria-labelledby="ai-reason-facts">
          <h3 id="ai-reason-facts">Checked by the game engine</h3>
          <FactList facts={facts} />
        </section>

        <div className="result-actions">
          <button ref={closeRef} type="button" className="button button-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
