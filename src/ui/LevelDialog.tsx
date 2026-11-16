import { useEffect, useRef, useState } from "react";
import type { AiLevel } from "../ai";
import { LevelOptions } from "./LevelOptions";

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
        <p className="dialog-subtitle">Your colour is random each game. Black moves first.</p>

        <LevelOptions value={level} onSelect={setLevel} onConfirm={onStart} />

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
