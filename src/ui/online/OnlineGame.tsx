// The online game with a friend (D92): the real game screen (the same
// board, cards, top bar, Menu and result panel as every game) with what
// does not apply online left out: no Previous or Next (no undo), no AI
// bubble, Why or levels, no win chance bar. The opponent's card shows their
// avatar, flag, username and whether they are here; your pieces are at the
// bottom (the board turns for White). Resign stays.
import { useCallback, useRef, useState } from "react";
import { opponentOf } from "../../engine";
import { displayedPosition } from "../../state/history";
import { pieceCounts } from "../../state/selectors";
import { Board } from "../Board";
import { boardViewOf } from "../gameView";
import { GameMenu } from "../GameMenu";
import type { MenuItem } from "../GameMenu";
import { DocumentIcon, GearIcon, TrophyIcon } from "../icons";
import { LbCrown } from "../leaderboard/lbIcons";
import { PlayerCard } from "../PlayerCard";
import { ResignButton } from "../ResignButton";
import { ResultDialog } from "../ResultDialog";
import { RulesDialog } from "../RulesDialog";
import { SettingsSheet } from "../SettingsSheet";
import { TermsDialog } from "../TermsDialog";
import { TopBar } from "../TopBar";
import { playFeedback } from "../feedback";
import type { MoveBeat } from "../feedback";
import { useAnimationKey } from "../useHistoryView";
import { TWO_COLUMNS, useMediaQuery } from "../useMediaQuery";
import { useGameDuration, useResultPopup } from "../useResultPopup";
import { LeaveIcon, LeaveRoomButton } from "./LeaveRoom";
import { onlineBoardView } from "./onlineBoard";
import { namesOf, phaseOf, resultSubtitle } from "./onlineText";
import { OnlineStatus } from "./OnlineStatus";
import { RematchActions } from "./RematchActions";
import { useOnlineGame } from "./useOnlineGame";
import type { RoomConnection } from "./useRoom";
import { useGameStartSound } from "./useGameStartSound";

const PIECES_PER_SIDE = 12;

interface OnlineGameProps {
  room: RoomConnection;
  onLeave: () => void; // after leaving: back to the home screen
}

export function OnlineGame({ room, onLeave }: OnlineGameProps) {
  const view = room.view!;
  const movingNow = useRef(false);
  const online = useOnlineGame(room, movingNow);
  const { state, me, winner } = online;
  const them = opponentOf(me);
  const names = namesOf(view, me);
  const opponent = view.opponent;

  const shown = displayedPosition(state);
  const moveKey = useAnimationKey(shown.index);
  // While a move's hops run, the board waits (never longer).
  const onMoveLock = useCallback((locked: boolean) => {
    movingNow.current = locked;
  }, []);
  const onMoveBeat = useCallback((beat: MoveBeat) => playFeedback(beat.event, beat.options), []);
  useGameStartSound(view.match?.number ?? 0);

  const durationMs = useGameDuration(state.movesPlayed, winner);
  const result = useResultPopup(winner, state.lastMove);
  const counts = pieceCounts(state.board);
  const forfeitIn = opponent?.forfeitInMs ?? null;
  const phase = phaseOf({
    view,
    me,
    names,
    board: state.board,
    winner,
    startsIn: online.startsIn,
    myTurn: online.myTurn,
    choosingRoute: state.pendingRoutes.length > 0,
    sending: online.pending,
    forfeitIn: forfeitIn === null ? null : forfeitIn - (Date.now() - room.receivedAt),
  });

  const [rulesOpen, setRulesOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const leave = useCallback(() => {
    void room.leave();
    onLeave();
  }, [room.leave, onLeave]);
  const playing = winner === null && view.status !== "closed" && view.status !== "expired";
  const leaveQuestion = playing ? "Leave the room? You lose this game." : "Leave the room?";
  const menuItems: MenuItem[] = [
    { label: "How to play", icon: <LbCrown jewel="#e9a92c" />, onSelect: () => setRulesOpen(true) },
    { label: "Settings", icon: <GearIcon />, onSelect: () => setSettingsOpen(true) },
    { label: "Terms and notices", icon: <DocumentIcon />, onSelect: () => setTermsOpen(true) },
    { label: "Leave room", icon: <LeaveIcon />, onSelect: leave, confirm: leaveQuestion },
  ];
  const twoColumns = useMediaQuery(TWO_COLUMNS);
  const menu = <GameMenu items={menuItems} />;

  const resign = useCallback(() => {
    playFeedback("resign");
    void room.resign();
  }, [room.resign]);
  const theirName = opponent?.username ?? "your friend";

  return (
    <main className="app app-online">
      <header className="topbar">
        <TopBar title="Checkervia" action={twoColumns ? undefined : menu} />
      </header>

      <section className="game" aria-label="Game">
        <PlayerCard
          player={them}
          name={opponent?.username ?? "Your friend"}
          robot={false}
          pieces={counts[them]}
          captured={PIECES_PER_SIDE - counts[me]}
          toMove={winner === null && online.started && state.currentPlayer === them}
          thinking={playing && online.started && state.currentPlayer === them}
          portrait={opponent?.avatar ?? null}
          winner={winner === them}
          placement="top"
          flag={opponent?.country ?? null}
          presence={opponent?.presence ?? "offline"}
        />
        <div className="board-area">
          <Board
            view={onlineBoardView(boardViewOf(state, shown, moveKey), me, online.canMove)}
            onSquareClick={online.click}
            onMoveBeat={onMoveBeat}
            onMoveLock={onMoveLock}
          />
        </div>
        <PlayerCard
          player={me}
          name="You"
          robot={false}
          pieces={counts[me]}
          captured={PIECES_PER_SIDE - counts[them]}
          toMove={winner === null && online.myTurn}
          thinking={false}
          portrait={view.you.avatar}
          winner={winner === me}
          placement="bottom"
          flag={view.you.country}
        />
      </section>

      <aside className="sidebar">
        <OnlineStatus phase={phase} problem={room.problem} />
        <nav className="action-bar" aria-label="Game actions">
          <div className="action-bar-inner action-bar-online">
            {twoColumns && menu}
            {playing ? (
              <ResignButton question={`Resign this game? ${theirName} wins.`} highlight={false} onResign={resign} />
            ) : (
              <button type="button" className="bar-button" disabled={winner === null} onClick={result.reopen}>
                <TrophyIcon />
                <span className="bar-label">Result</span>
              </button>
            )}
            <LeaveRoomButton question={leaveQuestion} onLeave={leave} />
          </div>
        </nav>
      </aside>

      {winner && result.open && (
        <ResultDialog
          winner={winner}
          mode="two-player"
          reason={phase.kind === "over" ? phase.reason : ""}
          stats={state.stats}
          pieces={counts}
          totalMoves={state.movesPlayed}
          durationMs={durationMs}
          onPlayAgain={() => void room.rematch()}
          onReview={result.close}
          onClose={result.close}
          online={{
            me,
            names,
            avatars: me === "black" ? { black: view.you.avatar, white: opponent?.avatar ?? null } : { black: opponent?.avatar ?? null, white: view.you.avatar },
            subtitle: resultSubtitle(winner === me),
            actions: <RematchActions view={view} theirName={theirName} onRematch={() => void room.rematch()} onLeave={leave} />,
          }}
        />
      )}
      {rulesOpen && <RulesDialog onClose={() => setRulesOpen(false)} />}
      {termsOpen && <TermsDialog onClose={() => setTermsOpen(false)} />}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
