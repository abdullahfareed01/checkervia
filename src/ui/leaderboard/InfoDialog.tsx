// The rules behind an (i) button (D64a), in a calm popup over the screen:
// how the ranking works on the leaderboard, and the rules for the username,
// flag and avatar on the Profile screen. Escape, the close button or a tap
// outside close it, and the focus goes back to the (i) button.
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { NAME_RESERVED_DAYS, RENAME_WAIT_DAYS } from "../../leaderboard/protocol";
import { CloseIcon, InfoIcon } from "./lbIcons";

export function InfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="lb-info-button" aria-label={label} title={label} onClick={onClick}>
      <InfoIcon />
    </button>
  );
}

export function InfoDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ids = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);
  return (
    <div className="lb-info-backdrop" onClick={onClose}>
      <div
        className="lb-info"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="lb-info-head">
          <span className="lb-info-mark" aria-hidden="true">
            <InfoIcon />
          </span>
          <h2 id={`${ids}-title`} className="lb-info-title">
            {title}
          </h2>
          <button ref={closeRef} type="button" className="lb-close lb-info-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="lb-info-body">{children}</div>
        <button type="button" className="lb-button lb-button-gold lb-info-done" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

/** How the leaderboard orders players (the same rules as ranking.ts, D56). */
export function RankingRules() {
  return (
    <>
      <p className="lb-info-lead">Every level has its own leaderboard, for this week, this month and all time.</p>
      <h3 className="lb-info-sub">What counts</h3>
      <ul className="lb-info-list">
        <li>Only wins against the AI count. Our server checks each win by replaying every move.</li>
        <li>Two player games, resigned games and games the AI wins never count.</li>
      </ul>
      <h3 className="lb-info-sub">The order</h3>
      <ol className="lb-info-steps">
        <li>
          <strong>Most wins first.</strong> More wins in the period always rank higher.
        </li>
        <li>
          <strong>Same wins? The quicker best win ranks higher.</strong> Your best win is the win in which you needed the fewest moves of your own. Fewer moves rank
          higher.
        </li>
        <li>
          <strong>Still the same?</strong> Whoever reached that number of wins first ranks higher.
        </li>
      </ol>
      <p className="lb-info-example">
        <strong>Example:</strong> Sara and Ali both have 5 wins this week. Sara's best win took 18 moves, Ali's took 22, so Sara ranks above Ali.
      </p>
      <h3 className="lb-info-sub">When it starts again</h3>
      <ul className="lb-info-list">
        <li>This week starts again every Monday at 00:00 UTC.</li>
        <li>This month starts again on the 1st at 00:00 UTC.</li>
        <li>All time keeps every win since the leaderboard opened.</li>
      </ul>
    </>
  );
}

/** The rules for the username, the flag and the avatar (the Terms say the same). */
export function ProfileRules({ onTerms }: { onTerms: () => void }) {
  return (
    <>
      <p className="lb-info-lead">Your username, flag, avatar and wins are public on the leaderboard.</p>
      <h3 className="lb-info-sub">Username</h3>
      <ul className="lb-info-list">
        <li>3 to 16 letters, numbers or underscores, starting with a letter. Each username is unique.</li>
        <li>Please do not use your real name. Names that are rude or pretend to be the game or its team are refused, and may be hidden or removed.</li>
        <li>
          You can change it once every {RENAME_WAIT_DAYS} days. Your old username stays reserved for you for {NAME_RESERVED_DAYS} days, so nobody else can take
          it. Your wins and stats stay with you.
        </li>
      </ul>
      <h3 className="lb-info-sub">Flag</h3>
      <ul className="lb-info-list">
        <li>You choose it yourself, or Prefer not to show a flag. It is never guessed from your connection.</li>
        <li>You can change it any time.</li>
      </ul>
      <h3 className="lb-info-sub">Avatar</h3>
      <ul className="lb-info-list">
        <li>Pick any picture you like and change it any time.</li>
        <li>The groups (male, female, kid, older adult) only help you find a picture. Which group you looked at is never sent or stored.</li>
      </ul>
      <h3 className="lb-info-sub">This device</h3>
      <ul className="lb-info-list">
        <li>Your profile is kept in this browser. Clearing your browser data loses it.</li>
      </ul>
      <button type="button" className="link-button lb-terms" onClick={onTerms}>
        Read the full Terms and notices
      </button>
    </>
  );
}
