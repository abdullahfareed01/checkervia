import { memo } from "react";
import type { ReactNode } from "react";
import type { Player } from "../engine";
import type { AiMood } from "./aiMood";
import { CrownIcon, HumanIcon, InfoIcon } from "./icons";
import { RobotFace } from "./RobotFace";
import { avatarUrl } from "./leaderboard/Avatar";
import { isAvatarId } from "../leaderboard/avatars";
import type { Presence } from "../online/protocol";
import { countryName, Flag } from "./leaderboard/Flag";

// At most this many captured pieces are drawn in the stack; the number says
// the rest.
const STACK_MAX = 5;

interface PlayerCardProps {
  player: Player;
  name: string; // "You", "AI", "Black", "White"
  robot: boolean; // the AI gets a robot, people get a person icon
  // The AI's chips in the name row (Change 4, D50): one level chip, its
  // voice at this level ("Playful" for Medium), and at Strongest the 18+
  // badge, a button that explains the language rules.
  chips?: { level: string; voice: string; onAdultInfo?: (() => void) | undefined } | undefined;
  pieces: number; // pieces left on the board
  captured: number; // opponent pieces this side has taken
  toMove: boolean;
  thinking: boolean;
  mood?: AiMood | undefined; // the robot's face (D64b); thinking when unset and thinking
  portrait?: string | null | undefined; // the player's chosen avatar id (D65); a person icon without one
  winner: boolean;
  placement: "top" | "bottom";
  action?: ReactNode; // focus mode's small Resign, after the turn (D88)
  // Online (D92): the player's flag before their name (null: no flag), and
  // whether they are here, with a dot on their picture.
  flag?: string | null | undefined;
  presence?: Presence | undefined;
}

const PRESENCE_TEXT: Record<Presence, string> = { online: "Online", away: "Away", offline: "Offline" };

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
  chips,
  pieces,
  captured,
  toMove,
  thinking,
  mood,
  portrait,
  winner,
  placement,
  action,
  flag,
  presence,
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
    <section
      className={classes}
      aria-label={`${name}${flag ? `, ${countryName(flag)}` : ""}, ${sideName(player)}${presence ? `, ${PRESENCE_TEXT[presence].toLowerCase()}` : ""}: ${text}. ${pieces} pieces left, took ${captured}.`}
    >
      <div className={`avatar${!robot && isAvatarId(portrait) ? " avatar-portrait" : ""}`}>
        {robot ? (
          <RobotFace mood={mood ?? (thinking ? "thinking" : "neutral")} />
        ) : isAvatarId(portrait) ? (
          <img src={avatarUrl(portrait)} alt="" width={48} height={48} decoding="async" draggable={false} />
        ) : (
          <HumanIcon />
        )}
      </div>
      {presence && <span className={`presence-dot presence-${presence}`} title={PRESENCE_TEXT[presence]} aria-hidden="true" />}

      <div className="card-text">
        <p className="card-name">
          {flag !== undefined && <Flag code={flag} decorative />}
          <span className="card-name-text">{name}</span>
          {robot && <span className="badge">BOT</span>}
          {chips && (
            <span className="card-chips">
              <span className="chip-level" title={`${chips.level} level`}>
                {chips.voice}
              </span>
              {chips.onAdultInfo && (
                <button type="button" className="chip-adult" aria-label="18 plus, strong language. About the language rules" onClick={chips.onAdultInfo}>
                  <span className="chip-adult-age">18+</span>
                  <span className="chip-adult-text">Strong language</span>
                  <span className="chip-adult-info" aria-hidden="true">
                    <InfoIcon />
                  </span>
                </button>
              )}
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
          {action}

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
