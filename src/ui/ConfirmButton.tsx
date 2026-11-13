import { useState } from "react";

interface ConfirmButtonProps {
  label: string; // e.g. "New game"
  className?: string; // extra classes for the button
  // True when the action would throw away a game in progress, so ask first.
  needsConfirmation: boolean;
  question: string; // e.g. "Start a new game? The current game will be lost."
  confirmLabel: string; // e.g. "Yes, new game"
  onConfirm: () => void;
}

// A button that runs its action at once, or first asks "are you sure?" when
// that would lose a game in progress. Used by New game and Menu.
export function ConfirmButton({ label, className = "", needsConfirmation, question, confirmLabel, onConfirm }: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);

  const run = () => {
    setConfirming(false);
    onConfirm();
  };

  if (confirming && needsConfirmation) {
    return (
      <div className="confirm" role="alertdialog" aria-label={`Confirm ${label.toLowerCase()}`}>
        <p>{question}</p>
        <button type="button" className="button button-danger" onClick={run}>
          {confirmLabel}
        </button>
        <button type="button" className="button" onClick={() => setConfirming(false)}>
          Keep playing
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`button ${className}`.trim()}
      onClick={needsConfirmation ? () => setConfirming(true) : run}
    >
      {label}
    </button>
  );
}
