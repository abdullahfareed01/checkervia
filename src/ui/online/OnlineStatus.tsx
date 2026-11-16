// The status line of an online game (D92), in a slot of fixed height so
// nothing below it moves: whose turn it is, the opponent's disconnect
// countdown, the end of the game, and this device's own connection.
import { memo } from "react";
import type { Player } from "../../engine";
import type { Problem } from "../leaderboard/Problem";
import { onlineProblemText } from "./roomErrors";

export type OnlinePhase =
  | { readonly kind: "starting"; readonly seconds: number }
  | { readonly kind: "yourTurn"; readonly choosingRoute: boolean }
  | { readonly kind: "theirTurn"; readonly sending: boolean }
  | { readonly kind: "disconnected"; readonly seconds: number }
  | { readonly kind: "over"; readonly winnerName: string; readonly winner: Player; readonly reason: string }
  | { readonly kind: "closed"; readonly text: string };

/** 0:42 */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function Main({ phase }: { phase: OnlinePhase }) {
  switch (phase.kind) {
    case "starting":
      return <span className="status-pill">Starting in {phase.seconds}</span>;
    case "yourTurn":
      return <span className="status-pill status-pill-you">Your turn</span>;
    case "theirTurn":
      return (
        <span className="status-pill">
          <span className="spinner" aria-hidden="true" />
          Opponent is thinking…
        </span>
      );
    case "disconnected":
      return (
        <span className="status-pill status-pill-warn">
          <span>Opponent disconnected</span>
          <span className="online-clock">{clock(phase.seconds)}</span>
        </span>
      );
    case "over":
      return (
        <span className="status-pill">
          <span className={`disc disc-${phase.winner}`} aria-hidden="true" />
          {phase.winnerName === "You" ? "You win!" : `${phase.winnerName} wins`}
        </span>
      );
    case "closed":
      return <span className="status-pill status-pill-warn">{phase.text}</span>;
  }
}

function hintOf(phase: OnlinePhase, problem: Problem | null): string | null {
  if (problem) return `${onlineProblemText(problem)} Reconnecting…`;
  if (phase.kind === "over") return phase.reason;
  if (phase.kind === "disconnected") return "If they come back in time, the game goes on. If not, you win.";
  if (phase.kind === "yourTurn" && phase.choosingRoute) return "Two routes reach that square. Tap the next square the piece should land on.";
  if (phase.kind === "theirTurn" && phase.sending) return "Sending your move…";
  return null;
}

export const OnlineStatus = memo(function OnlineStatus({ phase, problem }: { phase: OnlinePhase; problem: Problem | null }) {
  const hint = hintOf(phase, problem);
  return (
    <section className={`status online-status${phase.kind === "over" ? " status-winner" : ""}`} aria-live="polite">
      <p className="status-main">
        <Main phase={phase} />
      </p>
      <p className={`status-hint online-hint${problem ? " online-hint-problem" : ""}`}>{hint ?? " "}</p>
    </section>
  );
});
