import { AI_LEVELS, LEVELS } from "../ai";
import type { AiLevel } from "../ai";

interface LevelOptionsProps {
  value: AiLevel; // the level shown as chosen
  onSelect: (level: AiLevel) => void;
  onConfirm?: (level: AiLevel) => void; // a double click: choose and go
  compact?: boolean; // the smaller list in the Menu sheet
}

// The four AI levels as a radio list: a signal-bar meter, the name and one
// line saying what the AI gets at that level. Used by the level dialog and
// the Menu sheet.
export function LevelOptions({ value, onSelect, onConfirm, compact = false }: LevelOptionsProps) {
  return (
    <div className={`level-options${compact ? " level-options-compact" : ""}`} role="radiogroup" aria-label="AI level">
      {LEVELS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          className={`level-option${option === value ? " level-option-on" : ""}`}
          onClick={() => onSelect(option)}
          onDoubleClick={onConfirm ? () => onConfirm(option) : undefined}
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
  );
}
