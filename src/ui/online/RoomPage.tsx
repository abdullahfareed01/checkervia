// A room this browser is in (D142), from its first answer to leaving: the
// waiting room while the host is alone, then the game screen with the ready
// screen over it during the countdown. The room's code is kept on the
// device, so a reload or a second tab comes straight back here.
import { useCallback, useEffect } from "react";
import type { RoomView } from "../../online/protocol";
import { LbGradients } from "../leaderboard/lbIcons";
import { GameTitle } from "../TopBar";
import { OnlineGame } from "./OnlineGame";
import { ReadyOverlay } from "./ReadyOverlay";
import { onlineProblemText, refusalText } from "./roomErrors";
import { rememberRoom } from "./roomMemory";
import { useTicker } from "./useOnlineGame";
import { useRoom } from "./useRoom";
import { WaitingRoom } from "./WaitingRoom";

interface RoomPageProps {
  code: string;
  first: RoomView | null; // the answer that opened the room; null after a reload
  onHome: () => void;
}

export function RoomPage({ code, first, onHome }: RoomPageProps) {
  const room = useRoom(code, first);
  useEffect(() => {
    if (!room.refusal) rememberRoom(code);
  }, [code, room.refusal]);
  const leave = useCallback(() => {
    void room.leave();
    onHome();
  }, [room.leave, onHome]);
  const forget = useCallback(() => {
    rememberRoom(null);
    onHome();
  }, [onHome]);

  const view = room.view;
  const startsIn = view?.match ? view.match.startsInMs - (Date.now() - room.receivedAt) : 0;
  useTicker(startsIn > 0);

  if (room.refusal) return <RoomMessage text={refusalText(room.refusal)} onHome={forget} />;
  if (!view) return <RoomMessage text={room.problem ? onlineProblemText(room.problem) : "Opening your room…"} busy={!room.problem} onHome={leave} homeLabel="Leave room" />;
  if (view.status === "waiting") return <WaitingRoom room={room} onLeave={leave} />;
  if (!view.match) return <RoomMessage text={refusalText(view.status === "expired" ? "roomExpired" : "roomClosed")} onHome={forget} />;
  return (
    <>
      <OnlineGame room={room} onLeave={onHome} />
      {startsIn > 0 && <ReadyOverlay view={view} seconds={Math.ceil(startsIn / 1000)} />}
    </>
  );
}

/** A calm page for a room that cannot be shown: still opening, gone, or out of reach. */
function RoomMessage({ text, busy = false, onHome, homeLabel = "Back to the menu" }: { text: string; busy?: boolean; onHome: () => void; homeLabel?: string }) {
  return (
    <main className="online-page">
      <div className="online-frame online-frame-message">
        <LbGradients />
        <header className="online-head">
          <GameTitle text="Online" />
        </header>
        <p className="online-message" role="status">
          {busy && <span className="spinner" aria-hidden="true" />}
          {text}
        </p>
        <button type="button" className="lb-button lb-button-gold" onClick={onHome}>
          {homeLabel}
        </button>
      </div>
    </main>
  );
}
