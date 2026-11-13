import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  question: string; // e.g. "Start a new game? The current game will be lost."
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// A small "are you sure?" popup. Keep playing is the safe default (it has the
// focus); Esc or a click outside also cancels.
export function ConfirmDialog({ question, confirmLabel = "Yes, continue", onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <div className="result-backdrop" onClick={onCancel}>
      <div
        className="dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-question"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <p id="confirm-question" className="confirm-question">
          {question}
        </p>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="button" onClick={onCancel}>
            Keep playing
          </button>
          <button type="button" className="button button-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
