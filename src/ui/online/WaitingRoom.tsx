// The host's room while the friend has not come yet (D92): the code, big,
// with Copy and Share (the phone's share sheet, with a link that opens the
// game straight on joining), and the two seats: yours with your avatar, and
// a softly pulsing one for your friend.
import { useEffect, useRef, useState } from "react";
import { GameTitle } from "../TopBar";
import { Avatar } from "../leaderboard/Avatar";
import { Flag } from "../leaderboard/Flag";
import { LbGradients } from "../leaderboard/lbIcons";
import { LeaveIcon } from "./LeaveRoom";
import { CopyIcon, ShareIcon, TickIcon } from "./onlineIcons";
import { onlineProblemText } from "./roomErrors";
import type { RoomConnection } from "./useRoom";

/** The link that opens this room's join step. */
export const roomLink = (code: string) => `${window.location.origin}/?room=${code}`;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function WaitingRoom({ room, onLeave }: { room: RoomConnection; onLeave: () => void }) {
  const view = room.view!;
  const [done, setDone] = useState<"copied" | "linkCopied" | "shared" | "failed" | null>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  useEffect(() => copyRef.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(() => setDone(null), 2500);
    return () => clearTimeout(timer);
  }, [done]);

  const share = async () => {
    const data = { title: "Checkervia", text: `Play checkers with me. Room code ${view.code}`, url: roomLink(view.code) };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data);
        setDone("shared");
      } catch {
        // Closed the share sheet: nothing to say.
      }
      return;
    }
    setDone((await copyText(roomLink(view.code))) ? "linkCopied" : "failed");
  };

  const feedback =
    done === "copied" ? "Code copied." : done === "linkCopied" ? "Link copied. Send it to your friend." : done === "shared" ? "Sent." : done === "failed" ? "Could not copy. Read the code out instead." : "";

  return (
    <main className="online-page">
      <div className="online-frame">
        <LbGradients />
        <header className="online-head">
          <GameTitle text="Your room" />
        </header>

        <section className="online-code-card" aria-labelledby="online-code-label">
          <p id="online-code-label" className="online-code-label">
            Room code
          </p>
          <p className="online-code" aria-label={`Room code ${view.code.split("").join(" ")}`}>
            {view.code.split("").map((letter, index) => (
              <span key={index} className="online-code-letter" aria-hidden="true">
                {letter}
              </span>
            ))}
          </p>
          <div className="online-code-actions">
            <button
              ref={copyRef}
              type="button"
              className="lb-button online-copy"
              onClick={() => void copyText(view.code).then((copied) => setDone(copied ? "copied" : "failed"))}
            >
              {done === "copied" ? <TickIcon /> : <CopyIcon />}
              Copy
            </button>
            <button type="button" className="lb-button lb-button-gold online-share" onClick={() => void share()}>
              <ShareIcon />
              Share
            </button>
          </div>
          <p className="online-feedback" role="status">
            {feedback || " "}
          </p>
        </section>

        <section className="online-seats" aria-label="Players">
          <div className="online-seat">
            <span className="lb-ring-gold online-seat-ring">
              <Avatar id={view.you.avatar} size={72} />
            </span>
            <span className="online-seat-name">
              <Flag code={view.you.country} decorative />
              <span className="lb-name">{view.you.username}</span>
            </span>
            <span className="online-seat-note">You</span>
          </div>
          <span className="online-vs" aria-hidden="true">
            VS
          </span>
          <div className="online-seat online-seat-empty">
            <span className="online-seat-ring online-seat-pulse" aria-hidden="true">
              <span className="online-seat-question">?</span>
            </span>
            <span className="online-seat-name">Your friend</span>
            <span className="online-seat-note">Not here yet</span>
          </div>
        </section>

        <p className="online-waiting" aria-live="polite">
          {room.problem ? onlineProblemText(room.problem) : room.paused ? "Still waiting? We stopped checking for now." : "Waiting for your friend…"}
        </p>
        {room.paused && (
          <button type="button" className="lb-button lb-button-gold" onClick={room.keepWaiting}>
            Keep waiting
          </button>
        )}
        <p className="online-note">The room stays open for 24 hours. Online games never count on the leaderboard or in the AI's record.</p>

        <button type="button" className="lb-button online-leave" onClick={onLeave}>
          <LeaveIcon />
          Leave room
        </button>
      </div>
    </main>
  );
}
