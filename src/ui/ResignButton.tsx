import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

interface ResignButtonProps {
  question: string; // e.g. "Resign this game? The AI wins."
  highlight: boolean; // the engine proved the position lost (the resign hint)
  onResign: () => void;
}

// Resign (Change 4): asks in a confirmation sheet first. While the resign
// hint is up, the button gets a subtle highlight (a gold outline, no glow).
export function ResignButton({ question, highlight, onResign }: ResignButtonProps) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" className={`button${highlight ? " button-resign-hint" : ""}`} onClick={() => setAsking(true)}>
        Resign
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
