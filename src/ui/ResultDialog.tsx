import { useEffect, useRef, useState } from "react";
import type { GameTip } from "../ai/endgame";
import type { Player } from "../engine";
import type { GameMode, SideStats } from "../state/gameReducer";
import { AI_PLAYER } from "../state/gameReducer";
import { RobotIcon, TrophyIcon } from "./icons";
import { TIPS_DELAY_MS, revealAfter } from "./idleTimer";
import type { EndLine } from "./usePersonality";

interface ResultDialogProps {
  winner: Player;
  mode: GameMode;
  reason: string; // e.g. "White has no pieces left."
  stats: Readonly<Record<Player, SideStats>>;
  pieces: Record<Player, number>;
  totalMoves: number;
  durationMs: number | null; // from the first move to the end
  onPlayAgain: () => void;
  onReview: () => void; // close and step through the game from the start
  onClose: () => void; // close and look at the final board
  // Against the AI (Change 4): its line, shown at once in the chat bubble
  // style; and after the AI won, its tips from the engine (null while the
  // engine works them out; undefined: no tips, for example after a win).
  aiLine?: EndLine | null | undefined;
  tips?: readonly GameTip[] | null | undefined;
  tipsShownAtStart?: boolean; // tests render the revealed state
}

type Outcome = "victory" | "defeat" | "winner";

// victory: you beat the AI. defeat: the AI beat you. winner: two players.
function outcomeOf(mode: GameMode, winner: Player): Outcome {
  if (mode !== "vs-ai") return "winner";
  return winner === AI_PLAYER ? "defeat" : "victory";
}

function nameOf(mode: GameMode, player: Player): string {
  if (mode === "vs-ai") return player === AI_PLAYER ? "AI" : "You";
  return player === "black" ? "Black" : "White";
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const TITLES: Record<Outcome, (winnerName: string) => string> = {
  victory: () => "You win!",
  defeat: () => "AI wins",
  winner: (name) => `${name} wins!`,
};

const SUBTITLES: Record<Outcome, string> = {
  victory: "You outplayed the robot.",
  defeat: "The robot takes this one. Try again?",
  winner: "Well played, both of you.",
};

// Falling confetti for a win. Positions are fixed per index (not random), so
// the popup looks the same every time and renders the same on the server.
function Confetti() {
  const colours = ["#ffcf40", "#5bc8ff", "#ff5a8a", "#9dff7a"];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colours[i % colours.length],
            animationDelay: `${(i % 7) * 0.13}s`,
            animationDuration: `${2.2 + (i % 5) * 0.35}s`,
          }}
        />
      ))}
    </div>
  );
}

// The popup at the end of a game: who won, why, and the stats of both sides.
export function ResultDialog(props: ResultDialogProps) {
  const { winner, mode, reason, stats, pieces, totalMoves, durationMs, onPlayAgain, onReview, onClose, aiLine, tips } = props;
  const outcome = outcomeOf(mode, winner);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  // The tips fade in after about 5 seconds; "Show tips now" skips the wait.
  const [tipsShown, setTipsShown] = useState(props.tipsShownAtStart ?? false);
  useEffect(() => (tips === undefined ? undefined : revealAfter(TIPS_DELAY_MS, () => setTipsShown(true))), [tips === undefined]);

  // Put the keyboard on the main button when the popup opens.
  useEffect(() => playAgainRef.current?.focus(), []);

  // Both columns: the winner first.
  const sides: Player[] = [winner, winner === "black" ? "white" : "black"];
  const rows: { label: string; value: (player: Player) => string | number }[] = [
    { label: "Pieces left", value: (p) => pieces[p] },
    { label: "Pieces captured", value: (p) => stats[p].captured },
    { label: "Kings made", value: (p) => stats[p].kingsMade },
    { label: "Best multi jump", value: (p) => (stats[p].bestChain > 1 ? `${stats[p].bestChain} in one move` : "None") },
    { label: "Moves", value: (p) => stats[p].moves },
  ];

  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        className={`result result-${outcome}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        {outcome !== "defeat" && <Confetti />}

        <div className="result-emblem" aria-hidden="true">
          {outcome === "defeat" ? <RobotIcon thinking /> : <TrophyIcon />}
        </div>

        <h2 id="result-title" className="result-title">
          {TITLES[outcome](nameOf(mode, winner))}
        </h2>
        {aiLine ? (
          <p className={`result-line speech-${aiLine.tone}`}>{aiLine.text}</p>
        ) : (
          <p className="result-subtitle">{SUBTITLES[outcome]}</p>
        )}
        <p className="result-reason">{reason}</p>

        <table className="result-stats">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Stat</span>
              </th>
              {sides.map((side) => (
                <th key={side} scope="col" className={side === winner ? "result-col-winner" : undefined}>
                  <span className={`disc disc-${side}`} aria-hidden="true" />
                  {nameOf(mode, side)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {sides.map((side) => (
                  <td key={side} className={side === winner ? "result-col-winner" : undefined}>
                    {row.value(side)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="result-meta">
          <span>{totalMoves} moves in total</span>
          {durationMs !== null && <span>Game time {formatDuration(durationMs)}</span>}
        </p>

        <div className="result-actions">
          <button ref={playAgainRef} type="button" className="button button-primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="button" onClick={onReview}>
            Review game
          </button>
        </div>

        {tips !== undefined && <AiTips tips={tips} shown={tipsShown} onShowNow={() => setTipsShown(true)} />}
      </div>
    </div>
  );
}

// "Tips from the AI" (Change 4): up to three tips worked out by the engine
// from this game. Hidden for the first seconds with a "Show tips now" link;
// the reveal is announced once to screen readers.
function AiTips({ tips, shown, onShowNow }: { tips: readonly GameTip[] | null; shown: boolean; onShowNow: () => void }) {
  return (
    <section className="result-tips" aria-label="Tips from the AI">
      <p className="sr-only" aria-live="polite">
        {shown && tips ? "Tips from the AI are shown below." : ""}
      </p>
      {shown ? (
        <div className="result-tips-body">
          <h3>Tips from the AI</h3>
          <p className="result-tips-caption">Checked by the game engine</p>
          {tips ? (
            <ul>
              {tips.map((tip) => (
                <li key={tip.text}>{tip.text}</li>
              ))}
            </ul>
          ) : (
            <p className="result-tips-caption">The engine is still looking at your game.</p>
          )}
        </div>
      ) : (
        <button type="button" className="link-button" onClick={onShowNow}>
          Show tips now
        </button>
      )}
    </section>
  );
}
