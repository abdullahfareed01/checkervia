import { useEffect, useRef } from "react";
import { SECTIONS } from "./HowToPlay";

// The rules in a popup, opened from the game's Menu, so reading them never
// ends the game. Same text as the How to play page.
export function RulesDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        className="dialog rules-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2 id="rules-title" className="dialog-title">
          How to play
        </h2>
        {SECTIONS.map((section) => (
          <section key={section.title} className="rules-dialog-section">
            <h3>{section.title}</h3>
            <ul>
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}
        <div className="dialog-actions">
          <button ref={closeRef} type="button" className="button button-primary" onClick={onClose}>
            Back to the game
          </button>
        </div>
      </div>
    </div>
  );
}
