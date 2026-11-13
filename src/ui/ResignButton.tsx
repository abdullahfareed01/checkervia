import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { FlagIcon } from "./icons";

interface ResignButtonProps {
  question: string; // e.g. "Resign this game? The AI wins."
  highlight: boolean; // the engine proved the position lost (the resign hint)
  onResign: () => void;
}

// Resign (Change 4), on the action bar: asks in a confirmation sheet first.
// While the resign hint is up, the button gets a subtle highlight (a gold
// outline, no glow).
export function ResignButton({ question, highlight, onResign }: ResignButtonProps) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" className={`bar-button${highlight ? " button-resign-hint" : ""}`} onClick={() => setAsking(true)}>
        <FlagIcon />
        <span className="bar-label">Resign</span>
      </button>
      {asking && (
        <ConfirmDialog
          question={question}
          confirmLabel="Yes, resign"
          onConfirm={() => {
            setAsking(false);
            onResign();
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
