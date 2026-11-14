// The result panel's leaderboard line (D61): after a qualifying win the win
// is sent by itself when the panel appears, with no button and no form. The
// line shows the player's avatar and what happened:
//   "Adding your win…"
//   "Added. You are number 12 this week on Strongest."
//   a problem (offline, a server problem, too many requests, D59), with Try
//   again and the promise that the win is kept and sent later by itself;
//   a refusal the player cannot fix (the game could not be checked).
import { useEffect } from "react";
import { Avatar } from "./Avatar";
import { useLeaderboardProfile } from "./profile";
import type { QualifyingWin } from "./profile";
import { problemText } from "./Problem";
import { addedText, sendQueued, useWinStatus } from "./winQueue";

export const KEPT_TEXT = "Your win is kept on this device and added by itself later.";

export function WinStatus({ win, onViewLeaderboard }: { win: QualifyingWin; onViewLeaderboard?: (() => void) | undefined }) {
  const { profile } = useLeaderboardProfile();
  const status = useWinStatus(win.gameId);
  // Sent once when the panel first appears (the queue retries later on its own).
  useEffect(() => {
    if (status === undefined) sendQueued(win.gameId);
  }, [win.gameId]);

  const shown = status ?? { kind: "sending" as const };
  return (
    <section className={`lb-win-status lb-win-${shown.kind}`} aria-label="Leaderboard">
      <Avatar id={profile?.avatar ?? null} size={44} className="lb-win-avatar" />
      <div className="lb-win-text">
        {shown.kind === "sending" && (
          <p role="status" className="lb-win-line">
            Adding your win…
          </p>
        )}
        {shown.kind === "added" && (
          <p role="status" className="lb-win-line">
            {addedText(shown)}
          </p>
        )}
        {shown.kind === "problem" && (
          <>
            <p role="alert" className="lb-win-line">
              {problemText(shown.problem)}
            </p>
            <p className="lb-win-sub">{KEPT_TEXT}</p>
          </>
        )}
        {shown.kind === "refused" && (
          <p role="alert" className="lb-win-line">
            {shown.text}
          </p>
        )}
      </div>
      {shown.kind === "problem" && (
        <button type="button" className="lb-win-action" onClick={() => sendQueued(win.gameId)}>
          Try again
        </button>
      )}
      {shown.kind === "added" && onViewLeaderboard && (
        <button type="button" className="lb-win-action" onClick={onViewLeaderboard}>
          View
          <span className="sr-only"> the leaderboard</span>
        </button>
      )}
    </section>
  );
}
