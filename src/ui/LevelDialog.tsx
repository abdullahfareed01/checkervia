import { useEffect, useRef, useState } from "react";
import { AI_LEVELS, LEVELS } from "../ai";
import type { AiLevel } from "../ai";

interface LevelDialogProps {
  initial: AiLevel; // preselected (the last level chosen)
  onStart: (level: AiLevel) => void;
  onCancel: () => void;
}

// Asked when the player chooses to play against the AI: pick one of the four
// levels, then start. Esc or a click outside cancels.
export function LevelDialog({ initial, onStart, onCancel }: LevelDialogProps) {
  const [level, setLevel] = useState<AiLevel>(initial);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => startRef.current?.focus(), []);

  return (
    <div className="result-backdrop" onClick={onCancel}>
      <div
        className="dialog level-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <h2 id="level-title" className="dialog-title">
          Choose the AI level
        </h2>
        <p className="dialog-subtitle">You play Black. The AI plays White.</p>

        <div className="level-options" role="radiogroup" aria-label="AI level">
          {LEVELS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === level}
              className={`level-option${option === level ? " level-option-on" : ""}`}
              onClick={() => setLevel(option)}
              onDoubleClick={() => onStart(option)}
            >
              <span className="level-steps" aria-hidden="true">
                {LEVELS.map((step) => (
                  <span key={step} className={step <= option ? "level-step-on" : undefined} />
                ))}
              </span>
              <span className="level-text">
                <span className="level-name">{AI_LEVELS[option].name}</span>
                <span className="level-description">{AI_LEVELS[option].description}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="dialog-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button ref={startRef} type="button" className="button button-primary" onClick={() => onStart(level)}>
            Start game
          </button>
        </div>
      </div>
    </div>
  );
}
