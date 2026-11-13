import { memo } from "react";
import type { Player } from "../engine";
import { CrownIcon, HumanIcon, RobotAvatar } from "./icons";

// At most this many captured pieces are drawn in the stack; the number says
// the rest.
const STACK_MAX = 5;

interface PlayerCardProps {
  player: Player;
  name: string; // "You", "AI", "Black", "White"
  robot: boolean; // the AI gets a robot, people get a person icon
  level?: string | undefined; // the AI's level, e.g. "Expert"
  pieces: number; // pieces left on the board
  captured: number; // opponent pieces this side has taken
  toMove: boolean;
  thinking: boolean;
  winner: boolean;
  placement: "top" | "bottom";
}

function sideName(player: Player): string {
  return player === "black" ? "Black" : "White";
}

type State = "winner" | "thinking" | "turn" | "waiting";

function stateOf({ winner, thinking, toMove }: Pick<PlayerCardProps, "winner" | "thinking" | "toMove">): State {
  if (winner) return "winner";
  if (thinking) return "thinking";
  return toMove ? "turn" : "waiting";
}

// "Your turn" for the person playing the AI; "To move" in a two-player game.
function stateText(state: State, name: string): string {
  if (state === "winner") return "Winner";
  if (state === "thinking") return "Thinking";
  if (state === "turn") return name === "You" ? "Your turn" : "To move";
  return "Waiting";
}

// The opponent's pieces this side has taken, drawn as a small stack.
function Captures({ player, captured }: { player: Player; captured: number }) {
  const victims = player === "black" ? "white" : "black";
  return (
    <span className="captures" aria-hidden="true">
      {Array.from({ length: Math.min(captured, STACK_MAX) }, (_, index) => (
        <span key={index} className={`mini mini-${victims}`} />
      ))}
    </span>
  );
}

// One player's card above or below the board: portrait, name and badges,
// whose turn it is, pieces left (the big number) and pieces taken.
export const PlayerCard = memo(function PlayerCard({
  player,
  name,
  robot,
  level,
  pieces,
  captured,
  toMove,
  thinking,
  winner,
  placement,
}: PlayerCardProps) {
  const state = stateOf({ winner, thinking, toMove });
  const text = stateText(state, name);
  const classes = [
    "card",
    `card-${placement}`,
    `card-${player}`,
    robot && "card-robot",
    toMove && "card-to-move",
    thinking && "card-thinking",
    winner && "card-winner",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} aria-label={`${name}, ${sideName(player)}: ${text}. ${pieces} pieces left, took ${captured}.`}>
      <div className="avatar">{robot ? <RobotAvatar thinking={thinking} /> : <HumanIcon />}</div>

      <div className="card-text">
        <p className="card-name">
          <span className="card-name-text">{name}</span>
          {robot && <span className="badge">BOT</span>}
          {level && (
            <span className="badge badge-level">
              <CrownIcon />
              {level}
            </span>
          )}
          {winner && <CrownIcon />}
        </p>
        <p className="card-status">
          <span className={`status-dot${state === "turn" || state === "thinking" ? " status-dot-on" : ""}`} aria-hidden="true" />
          {sideName(player)}
          <span className="card-dot" aria-hidden="true">
            •
          </span>
          <span className={`card-state card-state-${state}`}>
            {text}
            {state === "thinking" && <span className="dots" aria-hidden="true" />}
          </span>
        </p>
      </div>

      <div className="card-stats">
        <strong className="card-count">{pieces}</strong>
        <span className="card-took">
          <Captures player={player} captured={captured} />
          <span className="card-took-text">Took: {captured}</span>
        </span>
      </div>
    </section>
  );
});
