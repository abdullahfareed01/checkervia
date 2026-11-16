import { memo, useState } from "react";
import type { ReactElement } from "react";
import type { GameMode } from "../state/gameReducer";
import { ConfirmDialog } from "./ConfirmDialog";
import { RobotIcon, TwoPlayersIcon } from "./icons";

interface ModeSelectorProps {
  mode: GameMode;
  // True while a game is in progress, so switching would throw it away.
  needsConfirmation: boolean;
  onChange: (mode: GameMode) => void;
}

const OPTIONS: { mode: GameMode; label: string; Icon: () => ReactElement }[] = [
  { mode: "two-player", label: "Two Players", Icon: TwoPlayersIcon },
  { mode: "vs-ai", label: "Play vs AI", Icon: () => <RobotIcon /> },
];

// A two-part switch between two humans and playing the AI (human is Black),
// with a line saying who plays which side. Switching starts a new game, so it
// asks first if a game is in progress.
export const ModeSelector = memo(function ModeSelector({ mode, needsConfirmation, onChange }: ModeSelectorProps) {
  const [pending, setPending] = useState<GameMode | null>(null);

  const choose = (next: GameMode) => {
    if (next === mode) return;
    if (needsConfirmation) setPending(next);
    else onChange(next);
  };

  return (
    <section className="mode" aria-label="Game mode">
      <div className="segmented" role="group">
        {OPTIONS.map(({ mode: option, label, Icon }) => (
          <button
            key={option}
            type="button"
            className={`segment${option === mode ? " segment-on" : ""}`}
            aria-pressed={option === mode}
            onClick={() => choose(option)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>
      <p className="mode-note">
        {mode === "vs-ai" ? (
          <>
            Random colour each game <span aria-hidden="true">•</span> Black moves first
          </>
        ) : (
          <>
            Black moves first <span aria-hidden="true">•</span> Take turns on one screen
          </>
        )}
      </p>
      {pending && needsConfirmation && (
        <ConfirmDialog
          question="Switch mode? This starts a new game and the current one will be lost."
          confirmLabel="Yes, switch"
          onConfirm={() => {
            onChange(pending);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
});
