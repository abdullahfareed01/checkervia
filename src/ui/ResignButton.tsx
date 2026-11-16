import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { FlagIcon } from "./icons";

interface ResignButtonProps {
  question: string; // e.g. "Resign this game? The AI wins."
  highlight: boolean; // the engine proved the position lost (the resign hint)
  onResign: () => void;
  compact?: boolean; // focus mode (D87): a small flag only, beside the mute button
}

// Resign (Change 4), on the action bar: asks in a confirmation sheet first.
// While the resign hint is up, the button gets a subtle highlight (a gold
// outline, no glow).
export function ResignButton({ question, highlight, onResign, compact = false }: ResignButtonProps) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      {compact ? (
        <button type="button" className={`coach-resign${highlight ? " button-resign-hint" : ""}`} aria-label="Resign" title="Resign" onClick={() => setAsking(true)}>
          <FlagIcon />
        </button>
      ) : (
        <button type="button" className={`bar-button${highlight ? " button-resign-hint" : ""}`} onClick={() => setAsking(true)}>
          <FlagIcon />
          <span className="bar-label">Resign</span>
        </button>
      )}
      {asking && (
        <ConfirmDialog
          question={question}
          confirmLabel="Yes, resign"
          icon={<FlagIcon />}
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
