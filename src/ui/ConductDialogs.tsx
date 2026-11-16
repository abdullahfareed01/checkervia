// The popups for abandoned games and the suspension (D85), small and in the
// game's confirm dialog style. The abandon popup comes after the AI's last
// line: the start of the game ("Please do not start a game when you are not
// ready.") or later ("The AI reported you for not playing."), and how many
// reports are left before a 30 day suspension. The suspension popup comes
// whenever a suspended player tries to play the AI, opens the app or the
// Profile, with the email address for questions.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CONTACT_EMAIL, REPORT_LIMIT, SUSPENSION_DAYS } from "../leaderboard/protocol";
import type { AbandonOutcome } from "./conduct";
import { conductStore } from "./conduct";
import { AlertIcon, FlagIcon } from "./icons";
import "./conduct.css";

/** A date as "16 December 2026". */
export function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** "3 more reports and your account will be suspended for 30 days." */
export function reportsLeftText(left: number): string {
  return `${left} more ${left === 1 ? "report" : "reports"} and your account will be suspended for ${SUSPENSION_DAYS} days.`;
}

interface SmallDialogProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  onClose: () => void;
}

function SmallDialog({ icon, title, children, onClose }: SmallDialogProps) {
  const ids = useId();
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => okRef.current?.focus(), []);
  return (
    <div className="result-backdrop conduct-backdrop">
      <div
        className="dialog confirm-dialog conduct-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-body`}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <span className="confirm-mark" aria-hidden="true">
          {icon}
        </span>
        <h2 id={`${ids}-title`} className="confirm-question conduct-title">
          {title}
        </h2>
        <div id={`${ids}-body`} className="conduct-body">
          {children}
        </div>
        <div className="confirm-actions conduct-actions">
          <button ref={okRef} type="button" className="confirm-button confirm-keep" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function Contact() {
  return (
    <p className="conduct-contact">
      Think this is a mistake? Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    </p>
  );
}

/** After an abandoned game. `outcome` null: the report is still being counted. */
export function AbandonDialog({ outcome, onClose }: { outcome: AbandonOutcome | null; onClose: () => void }) {
  const start = outcome?.phase === "start";
  return (
    <SmallDialog icon={<FlagIcon />} title="Game abandoned" onClose={onClose}>
      <p className="conduct-lead">{start ? "Please do not start a game when you are not ready." : "The AI reported you for not playing."}</p>
      {outcome?.suspendedUntil ? (
        <>
          <p className="conduct-warning">
            That was report {REPORT_LIMIT}. Your account is suspended for {SUSPENSION_DAYS} days, until {longDate(outcome.suspendedUntil)}.
          </p>
          <Contact />
        </>
      ) : outcome ? (
        <p className="conduct-warning">{reportsLeftText(outcome.left)}</p>
      ) : null}
    </SmallDialog>
  );
}

/** For a suspended account: no games against the AI until the date. */
export function SuspendedDialog({ until, onClose }: { until: number; onClose: () => void }) {
  return (
    <SmallDialog icon={<AlertIcon />} title="Account suspended" onClose={onClose}>
      <p className="conduct-lead">
        Your account has been suspended for {SUSPENSION_DAYS} days: the AI reported you {REPORT_LIMIT} times for not playing.
      </p>
      <p className="conduct-warning">You can play the AI again on {longDate(until)}. Two players and Learn are open.</p>
      <Contact />
    </SmallDialog>
  );
}

/**
 * The suspension popup on demand. `notify(next)`: when the account is
 * suspended, shows the popup and returns true (`next`, if given, runs after
 * OK, as for the Profile); otherwise returns false and does nothing.
 */
export function useSuspendedNotice(): [(next?: () => void) => boolean, ReactNode] {
  const [shown, setShown] = useState<{ until: number; next: (() => void) | undefined } | null>(null);
  const notify = useCallback((next?: () => void) => {
    if (!conductStore.isSuspended()) return false;
    setShown({ until: conductStore.get().suspendedUntil!, next });
    return true;
  }, []);
  const node = shown && (
    <SuspendedDialog
      until={shown.until}
      onClose={() => {
        setShown(null);
        shown.next?.();
      }}
    />
  );
  return [notify, node];
}
