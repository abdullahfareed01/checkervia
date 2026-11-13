import { useCallback, useEffect, useRef, useState } from "react";
import { playFeedback } from "./feedback";
import type { ReactNode } from "react";
import type { AiLevel } from "../ai";
import { hasConsent, nextConsentStep, saveConsent } from "./consent";
import type { ConsentStep } from "./consent";
import { TermsDialog } from "./TermsDialog";

// The text of each step. No hyphens or dashes in anything players see.
const STEPS: Record<ConsentStep, { title: string; text: string; yes: string; no?: string }> = {
  age: {
    title: "Strongest level is for adults",
    text: "Strongest level is for adults. Are you 18 or older?",
    yes: "Yes, I am 18 or older",
    no: "No",
  },
  notice: {
    title: "Strong language",
    text: "At this level the AI may use strong language, insults and mild profanity when you make mistakes. It is part of the game and is not meant seriously. Continue only if you accept this.",
    yes: "I understand and accept",
    no: "Cancel",
  },
  declined: {
    title: "No problem",
    text: "Strongest stays locked and nothing has changed. You can play Easy, Medium or Hard any time.",
    yes: "OK",
  },
};

interface ConsentDialogProps {
  step: ConsentStep;
  onAnswer: (yes: boolean) => void;
}

// One step of the 18+ consent for the Strongest level. The notice step links
// to the Terms and notices. Escape or a click outside counts as No.
export function ConsentDialog({ step, onAnswer }: ConsentDialogProps) {
  const [termsOpen, setTermsOpen] = useState(false);
  // Focus starts on No or Cancel, so Enter never accepts by accident.
  const focusRef = useRef<HTMLButtonElement>(null);
  const { title, text, yes, no } = STEPS[step];
  useEffect(() => focusRef.current?.focus(), [step]);

  return (
    <>
    <div className="result-backdrop" onClick={() => onAnswer(false)}>
      <div
        className="dialog consent-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        aria-describedby="consent-text"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !termsOpen) onAnswer(false);
        }}
      >
        <h2 id="consent-title" className="dialog-title">
          {title}
        </h2>
        <p id="consent-text" className="consent-text">
          {text}
        </p>
        {step === "notice" && (
          <button type="button" className="link-button" onClick={() => setTermsOpen(true)}>
            Read the Terms and notices
          </button>
        )}
        <div className="dialog-actions">
          {no && (
            <button ref={focusRef} type="button" className="button" onClick={() => onAnswer(false)}>
              {no}
            </button>
          )}
          <button ref={no ? undefined : focusRef} type="button" className="button button-primary" onClick={() => onAnswer(true)}>
            {yes}
          </button>
        </div>
      </div>
    </div>
    {/* A sibling, not a child: a click in the Terms must not reach the
        consent backdrop (which would count as No). */}
    {termsOpen && <TermsDialog onClose={() => setTermsOpen(false)} />}
    </>
  );
}

/**
 * Starting a game at a level goes through here: Strongest first asks the two
 * consent steps, unless this browser already accepted the current notice.
 * Returns the function to call and the dialog to render.
 */
export function useStrongestGate(start: (level: AiLevel) => void): [(level: AiLevel) => void, ReactNode] {
  const [step, setStep] = useState<ConsentStep | null>(null);
  const request = useCallback(
    (level: AiLevel) => {
      if (level !== 4 || hasConsent()) start(level);
      else setStep("age");
    },
    [start],
  );
  const answer = (yes: boolean) => {
    if (!step) return;
    const next = nextConsentStep(step, yes);
    if (next === "accepted") {
      playFeedback("consent");
      saveConsent(new Date());
      setStep(null);
      start(4);
    } else setStep(next === "closed" ? null : next);
  };
  return [request, step ? <ConsentDialog step={step} onAnswer={answer} /> : null];
}
