// Both players are in (D92): a short ready screen over the board with both
// avatars, names and flags, the colour each one plays (random in the first
// game, swapped in a rematch; Black moves first), then 3, 2, 1. The game
// screen is already behind it, so it simply fades away.
import type { Player } from "../../engine";
import type { RoomView } from "../../online/protocol";
import { Avatar } from "../leaderboard/Avatar";
import { Flag } from "../leaderboard/Flag";
import { LbGradients } from "../leaderboard/lbIcons";

const colourName = (colour: Player | null) => (colour === "white" ? "White" : "Black");

function Seat({ name, avatar, country, colour, you }: { name: string; avatar: string | null; country: string | null; colour: Player | null; you: boolean }) {
  return (
    <div className={`ready-seat${you ? " ready-seat-you" : ""}`}>
      <span className="lb-ring-gold ready-ring">
        <Avatar id={avatar} size={88} />
      </span>
      <span className="ready-name">
        <Flag code={country} decorative />
        <span className="lb-name">{name}</span>
      </span>
      <span className={`ready-colour ready-colour-${colour ?? "black"}`}>
        <span className={`disc disc-${colour ?? "black"}`} aria-hidden="true" />
        {you ? `You play ${colourName(colour)}` : colourName(colour)}
      </span>
    </div>
  );
}

export function ReadyOverlay({ view, seconds }: { view: RoomView; seconds: number }) {
  const opponent = view.opponent;
  const rematch = (view.match?.number ?? 1) > 1;
  return (
    <div className="ready-backdrop">
      <section className="ready-panel" role="dialog" aria-modal="true" aria-labelledby="ready-title" aria-describedby="ready-count">
        <LbGradients />
        <h2 id="ready-title" className="ready-title">
          {rematch ? "Rematch!" : "Get ready"}
        </h2>
        <div className="ready-seats">
          <Seat name={view.you.username} avatar={view.you.avatar} country={view.you.country} colour={view.you.colour} you />
          <span className="ready-vs" aria-hidden="true">
            VS
          </span>
          <Seat name={opponent?.username ?? "Your friend"} avatar={opponent?.avatar ?? null} country={opponent?.country ?? null} colour={opponent?.colour ?? null} you={false} />
        </div>
        <p className="ready-first">{rematch ? "The colours have swapped. Black moves first." : "Colours were picked at random. Black moves first."}</p>
        <p id="ready-count" className="ready-count" aria-live="assertive">
          {seconds <= 3 ? (
            <span key={seconds} className="ready-number">
              {seconds}
            </span>
          ) : (
            <span className="ready-wait">Starting…</span>
          )}
        </p>
      </section>
    </div>
  );
}
