import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { AlertIcon } from "./icons";

interface ConfirmDialogProps {
  question: string; // e.g. "Start a new game? The current game will be lost."
  confirmLabel?: string;
  cancelLabel?: string; // the safe choice
  icon?: ReactNode; // the symbol at the top; an exclamation mark by default
  onConfirm: () => void;
  onCancel: () => void;
}

// "Start a new game? The current game will be lost." becomes a heading (the
// question) and a quieter line under it (what happens), so the eye finds
// the question first.
export function splitQuestion(question: string): { title: string; detail: string } {
  const end = question.indexOf("?");
  if (end < 0 || end === question.length - 1) return { title: question, detail: "" };
  return { title: question.slice(0, end + 1), detail: question.slice(end + 1).trim() };
}

// A small "are you sure?" popup. The safe choice (Keep playing) is the
// default: the gold button, and it has the focus. Esc or a click outside also cancels.
export function ConfirmDialog({ question, confirmLabel = "Yes, continue", cancelLabel = "Keep playing", icon = <AlertIcon />, onConfirm, onCancel }: ConfirmDialogProps) {
  const ids = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  const { title, detail } = splitQuestion(question);

  return (
    <div className="result-backdrop" onClick={onCancel}>
      <div
        className="dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-question`}
        aria-describedby={detail ? `${ids}-detail` : undefined}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <span className="confirm-mark" aria-hidden="true">
          {icon}
        </span>
        <h2 id={`${ids}-question`} className="confirm-question">
          {title}
        </h2>
        {detail && (
          <p id={`${ids}-detail`} className="confirm-detail">
            {detail}
          </p>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="confirm-button confirm-keep" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="confirm-button confirm-go" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
