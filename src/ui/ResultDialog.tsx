import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { GameTip } from "../ai/endgame";
import type { Player } from "../engine";
import type { GameMode, SideStats } from "../state/gameReducer";
import { PieceArt, Ribbon, Scenery } from "./art";
import type { RibbonTone } from "./art";
import { toneClasses } from "./ChatBubble";
import {
  BulbIcon,
  CrownIcon,
  HourglassIcon,
  HumanIcon,
  JumpIcon,
  LaurelIcon,
  ListIcon,
  PiecesIcon,
  PlayIcon,
  RobotAvatar,
  StopwatchIcon,
  SwapIcon,
  SwordsIcon,
} from "./icons";
import { TIPS_DELAY_MS, revealAfter } from "./idleTimer";
import type { EndLine } from "./usePersonality";
import { avatarUrl } from "./leaderboard/Avatar";
import { isAvatarId } from "../leaderboard/avatars";

/**
 * An online game with a friend (D143): "You" and the opponent's username,
 * the winner's picture in the ring, the room's own buttons (Rematch, Leave
 * room) in place of Play Again and Review.
 */
export interface OnlineResult {
  readonly me: Player;
  readonly names: Readonly<Record<Player, string>>;
  readonly avatars: Readonly<Record<Player, string | null>>;
  readonly subtitle: string;
  readonly actions: ReactNode;
}

interface ResultDialogProps {
  winner: Player | null; // null: a draw (D89)
  mode: GameMode;
  aiSide?: Player; // the AI's colour against the person (D81); White if left out
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
  onTipsShown?: ((tips: readonly string[]) => void) | undefined; // the AI voice may read them
  // After a win that can go on the leaderboard: its form (D57).
  leaderboard?: ReactNode;
  online?: OnlineResult | undefined;
}

type Outcome = "victory" | "defeat" | "winner" | "draw";

// victory: you beat the AI. defeat: the AI beat you. winner: two players.
// draw: nobody won (D89).
function outcomeOf(mode: GameMode, winner: Player | null, aiSide: Player): Outcome {
  if (winner === null) return "draw";
  if (mode !== "vs-ai") return "winner";
  return winner === aiSide ? "defeat" : "victory";
}

function nameOf(mode: GameMode, player: Player, aiSide: Player): string {
  if (mode === "vs-ai") return player === aiSide ? "AI" : "You";
  return player === "black" ? "Black" : "White";
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// The ribbon's words, in title case as in mockup/winner_screen.png (D51).
const TITLES: Record<Outcome, (winnerName: string) => string> = {
  victory: () => "You Win!",
  defeat: () => "AI Wins",
  winner: (name) => `${name} Wins`,
  draw: () => "Draw",
};

// Shown in the pill when there is no AI line (two players).
const SUBTITLES: Record<Outcome, string> = {
  victory: "You outplayed the robot.",
  defeat: "The robot takes this one. Try again?",
  winner: "Well played, both of you.",
  draw: "Nobody could break through. Well played, both of you.",
};

// The ribbon's colour (owner's choice, D51): red for the AI, green for you,
// the winning side's colour in a two player game.
function ribbonTone(outcome: Outcome, winner: Player | null): RibbonTone {
  if (outcome === "defeat") return "ai";
  if (outcome === "victory") return "you";
  return winner ?? "draw"; // a draw: bronze, nobody's colour
}

// Who is in the gold ring: the robot, you, or the winning side's piece.
function Portrait({ outcome, winner }: { outcome: Outcome; winner: Player | null }) {
  if (outcome === "defeat") return <RobotAvatar />;
  if (outcome === "victory") return <HumanIcon />;
  return <PieceArt kind={winner === "white" ? "white" : "king"} />;
}

// Online (D143): the winner's chosen picture, a person without one.
function OnlinePortrait({ id }: { id: string | null }) {
  return isAvatarId(id) ? <img className="result-avatar" src={avatarUrl(id)} alt="" width={96} height={96} decoding="async" draggable={false} /> : <HumanIcon />;
}

// Falling confetti for a win. Positions are fixed per index (not random), so
// the popup looks the same every time and renders the same on the server.
function Confetti() {
  const colours = ["#ffd56a", "#f3e2bd", "#e8902c", "#7fc98f"];
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

interface StatRow {
  label: string;
  icon: ReactNode;
  value: (player: Player) => string | number;
}

// The end of a game (D51, after mockup/winner_screen.png): the winner in a
// gold ring under a crown between laurels, a ribbon with the result, the
// AI's line, why the game ended, both sides' stats, and what to do next.
export function ResultDialog(props: ResultDialogProps) {
  const { winner, mode, reason, stats, pieces, totalMoves, durationMs, onPlayAgain, onReview, onClose, aiLine, tips } = props;
  const aiSide = props.aiSide ?? "white";
  const online = props.online;
  // Online: "victory" for your win, "winner" for your friend's, a draw as everywhere (D89).
  const outcome: Outcome = online && winner ? (winner === online.me ? "victory" : "winner") : outcomeOf(mode, winner, aiSide);
  const label = (side: Player) => online?.names[side] ?? nameOf(mode, side, aiSide);
  const tone = ribbonTone(outcome, winner);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  // The tips fade in after about 5 seconds; "Show tips now" skips the wait.
  const [tipsShown, setTipsShown] = useState(props.tipsShownAtStart ?? false);
  useEffect(() => (tips === undefined ? undefined : revealAfter(TIPS_DELAY_MS, () => setTipsShown(true))), [tips === undefined]);

  // Put the keyboard on the main button when the popup opens, without
  // scrolling to it: on short screens the panel opens at its top, so the
  // result is the first thing seen.
  useEffect(() => playAgainRef.current?.focus({ preventScroll: true }), []);

  // Both columns: the winner first (a draw: Black first).
  const first: Player = winner ?? "black";
  const sides: Player[] = [first, first === "black" ? "white" : "black"];
  const rows: StatRow[] = [
    { label: "Pieces left", icon: <PiecesIcon />, value: (p) => pieces[p] },
    { label: "Pieces captured", icon: <SwordsIcon />, value: (p) => stats[p].captured },
    { label: "Kings made", icon: <CrownIcon />, value: (p) => stats[p].kingsMade },
    { label: "Best multi jump", icon: <JumpIcon />, value: (p) => (stats[p].bestChain > 1 ? `${stats[p].bestChain} in one move` : "None") },
    { label: "Moves", icon: <SwapIcon />, value: (p) => stats[p].moves },
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
        {outcome !== "defeat" && outcome !== "draw" && (!online || winner === online.me) && <Confetti />}

        <div className="result-hero">
          <div className="result-emblem" aria-hidden="true">
            <span className="result-emblem-crown">
              <CrownIcon />
            </span>
            <span className="result-laurel result-laurel-left">
              <LaurelIcon />
            </span>
            <span className={`result-portrait result-portrait-${outcome}`}>
              {online && winner ? <OnlinePortrait id={online.avatars[winner]} /> : <Portrait outcome={outcome} winner={winner} />}
            </span>
            <span className="result-laurel result-laurel-right">
              <LaurelIcon flip />
            </span>
          </div>
          <div className="result-banner">
            <Ribbon tone={tone} />
            <h2 id="result-title" className={`result-title result-title-${tone}`}>
              {TITLES[outcome](winner ? label(winner) : "")}
            </h2>
          </div>
        </div>

        {aiLine ? (
          <p className={`result-line ${toneClasses(aiLine)}${aiLine.text ? "" : " speech-typing"}`}>
            {aiLine.text || <><span /><span /><span /></>}
          </p>
        ) : (
          <p className="result-line result-subtitle">{online?.subtitle ?? SUBTITLES[outcome]}</p>
        )}
        <p className="result-reason">
          <span>{reason}</span>
        </p>

        <table className="result-stats">
          <thead>
            <tr>
              <th scope="col" colSpan={2}>
                <span className="sr-only">Stat</span>
              </th>
              {sides.map((side) => (
                <th key={side} scope="col" className={side === winner ? "result-col-winner" : undefined}>
                  <span className={`disc disc-${side}`} aria-hidden="true" />
                  {label(side)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="result-stat-icon" aria-hidden="true">
                  {row.icon}
                </td>
                <th scope="row">{row.label}</th>
                {sides.map((side) => (
                  <td key={side} className={side === winner ? "result-col-winner" : undefined}>
                    <span className={`result-value result-value-${side}`}>{row.value(side)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="result-meta">
          <span>
            <HourglassIcon />
            {totalMoves} {totalMoves === 1 ? "move" : "moves"} in total
          </span>
          {durationMs !== null && (
            <span>
              <StopwatchIcon />
              Game time: {formatDuration(durationMs)}
            </span>
          )}
        </p>

        {online ? (
          online.actions
        ) : (
          <div className="result-actions">
            <button ref={playAgainRef} type="button" className="result-play" onClick={onPlayAgain}>
              <PlayIcon />
              Play Again
            </button>
            <button type="button" className="result-review" onClick={onReview}>
              <ListIcon />
              Review Game
            </button>
          </div>
        )}

        {props.leaderboard}

        {tips !== undefined && <AiTips tips={tips} shown={tipsShown} onShowNow={() => setTipsShown(true)} onShown={props.onTipsShown} />}

        <Scenery className="result-scenery" />
      </div>
    </div>
  );
}

// "Tips from the AI" (Change 4): up to three tips worked out by the engine
// from this game. Hidden for the first seconds with a "Show tips now" link;
// the reveal is announced once to screen readers.
function AiTips({
  tips,
  shown,
  onShowNow,
  onShown,
}: {
  tips: readonly GameTip[] | null;
  shown: boolean;
  onShowNow: () => void;
  onShown?: ((tips: readonly string[]) => void) | undefined;
}) {
  // Once the tips are on screen, the AI voice may read them (D54).
  useEffect(() => {
    if (shown && tips) onShown?.(tips.map((tip) => tip.text));
  }, [shown, tips]);
  return (
    <section className="result-tips" aria-label="Tips from the AI">
      <p className="sr-only" aria-live="polite">
        {shown && tips ? "Tips from the AI are shown below." : ""}
      </p>
      {shown ? (
        <div className="result-tips-body">
          <h3>
            <BulbIcon />
            Tips from the AI
          </h3>
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
        <button type="button" className="link-button result-tips-link" onClick={onShowNow}>
          <BulbIcon />
          Show tips now
        </button>
      )}
    </section>
  );
}
