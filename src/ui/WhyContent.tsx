import { useEffect, useRef } from "react";
import type { FactLine } from "../state/moveFacts";
import type { AiExplanation } from "./useAiExplanation";

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

/** True if a "Why?" button has anything to show for this move (Change 2). */
export function hasWhy(explanation: AiExplanation | null): explanation is AiExplanation {
  return explanation !== null && (explanation.facts.length > 0 || explanation.reason !== null);
}

// What "Why?" shows (Change 2): first what the game engine checked, then the
// AI's own explanation, marked as possibly wrong. A part with nothing in it
// is left out. All text is plain text, never HTML.
export function WhyContent({ explanation }: { explanation: AiExplanation }) {
  return (
    <div className="why-content">
      {explanation.facts.length > 0 && (
        <section className="why-section" aria-label="Checked by the game engine">
          <h3>Checked by the game engine</h3>
          <FactList facts={explanation.facts} />
        </section>
      )}
      {explanation.reason && (
        <section className="why-section" aria-label="AI generated, may be wrong">
          <h3>AI generated, may be wrong</h3>
          <p className="why-reason">{explanation.reason}</p>
        </section>
      )}
    </div>
  );
}

export const WHY_PANEL_ID = "why-panel";

// On phones "Why?" opens this card floating above the page (Change 3), so
// the board and the cards never move. Close button, Esc or a tap outside
// closes it.
export function WhySheet({ explanation, onClose }: { explanation: AiExplanation; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  return (
    <div className="why-sheet-backdrop" onClick={onClose}>
      <div
        id={WHY_PANEL_ID}
        className="why-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="why-sheet-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="why-sheet-head">
          <h2 id="why-sheet-title">Why AI played {explanation.label}</h2>
          <button ref={closeRef} type="button" className="why-sheet-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <WhyContent explanation={explanation} />
      </div>
    </div>
  );
}
