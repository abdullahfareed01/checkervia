import { memo } from "react";
import { withoutDashes } from "../ai/language";
import type { Player } from "../engine";
import type { AiPhase } from "../state/gameReducer";

interface StatusBarProps {
  currentPlayer: Player;
  winner: Player | null;
  // Why the game ended, e.g. "White has no legal moves."
  winReason: string | null;
  captureMandatory: boolean;
  choosingRoute: boolean;
  aiPhase: AiPhase;
  aiFailureReasons: readonly string[];
  onRetryAi: () => void;
}

export function PlayerName({ player }: { player: Player }) {
  return (
    <span className="player-name">
      <span className={`disc disc-${player}`} aria-hidden="true" />
      {player === "black" ? "Black" : "White"}
    </span>
  );
}

// Shown while the AI is working: the board is locked.
function AiThinking() {
  return (
    <section className="status" aria-live="polite">
      <p className="status-main">
        <span className="status-pill">
          <span className="spinner" aria-hidden="true" />
          AI is thinking…
        </span>
      </p>
      <p className="status-hint">White is choosing a move. The board is locked.</p>
    </section>
  );
}

// Shown when the AI could not choose a valid move. No move was played.
function AiFailed({ reasons, onRetry }: { reasons: readonly string[]; onRetry: () => void }) {
  return (
    <section className="status status-failed" role="alert">
      <p className="status-main">The AI could not make a move</p>
      <p className="status-hint">
        It did not give a valid answer, so no move was played and the board stays locked.
        Retry to ask again, or start a new game.
      </p>
      <button type="button" className="button button-primary" onClick={onRetry}>
        Retry
      </button>
      {reasons.length > 0 && (
        <details className="status-details">
          <summary>Details</summary>
          <ul>
            {reasons.map((reason, index) => (
              // Reasons can quote the model or the network: no dashes shown.
              <li key={index}>{withoutDashes(reason)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// Shows whose turn it is, or the winner, plus any hint for the current turn.
export const StatusBar = memo(function StatusBar({
  currentPlayer,
  winner,
  winReason,
  captureMandatory,
  choosingRoute,
  aiPhase,
  aiFailureReasons,
  onRetryAi,
}: StatusBarProps) {
  if (winner) {
    return (
      <section className="status status-winner" aria-live="polite">
        <p className="status-main">
          <span className="status-pill">
            <PlayerName player={winner} /> wins!
          </span>
        </p>
        {winReason && <p className="status-hint">{winReason}</p>}
      </section>
    );
  }

  if (aiPhase === "failed") return <AiFailed reasons={aiFailureReasons} onRetry={onRetryAi} />;
  if (aiPhase === "thinking") return <AiThinking />;

  return (
    <section className="status" aria-live="polite">
      <p className="status-main">
        <span className="status-pill">
          <PlayerName player={currentPlayer} /> to move
        </span>
      </p>
      {choosingRoute ? (
        <p className="status-hint">
          Two routes reach that square. Click the next square the piece should land on.
        </p>
      ) : captureMandatory ? (
        <p className="status-hint status-hint-capture">
          Capture is mandatory. Pieces that must capture have a red ring.
        </p>
      ) : null}
    </section>
  );
});
