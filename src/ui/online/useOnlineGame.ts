// The board side of an online game (D142): the game state on screen follows
// the server's moves; the local player's move is shown at once and sent,
// and sent again after a network failure until the server answers. A move
// the server refuses is taken back (the board goes back to the server's
// game). The board accepts taps only on the player's own turn, after the
// countdown, while no move of theirs is on its way.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DrawReason, Player, Position } from "../../engine";
import { isDrawReason } from "../../online/protocol";
import { encodeMove } from "../../leaderboard/protocol";
import type { EncodedMove } from "../../leaderboard/protocol";
import { gameReducer } from "../../state/gameReducer";
import type { GameState } from "../../state/gameReducer";
import { shakeAt } from "../animation/shake";
import { clickFeedback, playFeedback } from "../feedback";
import { settingsStore } from "../settings";
import type { Ending } from "../useResultPopup";
import { freshGame, syncGame } from "./onlineBoard";
import type { RoomConnection } from "./useRoom";

const RESEND_MS = 2000;

interface PendingMove {
  readonly match: number;
  readonly ply: number;
  readonly move: EncodedMove;
}

/** Re-renders every quarter second while `on`: for the countdowns. */
export function useTicker(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

export function useOnlineGame(room: RoomConnection, movingNow: { current: boolean }) {
  const { view, game } = room;
  const me: Player = view?.you.colour ?? "black";
  const match = view?.match ?? null;
  const [pending, setPending] = useState<PendingMove | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // The server's moves, and ours on top while it is on its way.
  const ownOnTop = pending !== null && pending.match === game.match && pending.ply === game.moves.length;
  const target = useMemo(() => (ownOnTop ? [...game.moves, pending.move] : game.moves), [game.moves, ownOnTop, pending]);
  const [state, setState] = useState<GameState>(() => syncGame(freshGame(), target));
  const current = useRef(state);
  current.current = state;
  useEffect(() => setState((before) => syncGame(before, target)), [target]);

  // The server has our move (or the game moved on): nothing is on its way.
  useEffect(() => {
    if (pending && (pending.match !== game.match || game.moves.length > pending.ply)) setPending(null);
  }, [pending, game]);

  // The countdown before the first move (READY_MS), counted from when the view came.
  // (The ticker only makes the screen draw again; the time is read now.)
  const startsIn = match ? match.startsInMs - (Date.now() - room.receivedAt) : 0;
  useTicker(startsIn > 0);
  const started = match !== null && startsIn <= 0;
  const winner = match?.winner ?? state.winner;
  // A draw by the rules of every game (D89): the server's word, or the same
  // rules applied by the reducer to the same moves.
  const serverReason = match?.reason ?? null;
  const drawn: DrawReason | null = winner !== null ? null : isDrawReason(serverReason) ? serverReason : state.drawn;
  const ending: Ending = winner ?? (drawn ? "draw" : null);
  const over = ending !== null || view?.status === "closed" || view?.status === "expired";
  const myTurn = started && !over && state.currentPlayer === me && state.viewIndex === null;
  const canMove = myTurn && pending === null && match !== null;

  const send = useCallback(
    async (move: PendingMove) => {
      const result = await room.sendMove(move.ply, move.move);
      const still = pendingRef.current;
      if (result.kind === "ok" || still !== move) return;
      if (result.kind === "offline" || result.kind === "serverError" || (result.kind === "failed" && result.status === 429)) {
        setTimeout(() => {
          if (pendingRef.current === move) void send(move);
        }, RESEND_MS);
      } else {
        setPending(null); // refused: the board goes back to the server's game
      }
    },
    [room.sendMove],
  );

  const click = useCallback(
    (position: Position) => {
      if (!canMove || movingNow.current || !match) return;
      const before = current.current;
      const after = gameReducer(before, { type: "click", position });
      const event = clickFeedback(before, after, position);
      if (event) playFeedback(event, { column: position.col });
      if (event === "invalid" || event === "captureRequired") {
        const onPiece = before.board[position.row]?.[position.col];
        shakeAt(onPiece || !before.selected ? position : before.selected, settingsStore().get().animation.level);
      }
      setState(after);
      if (after.history.length > before.history.length && after.lastMove) {
        const move = { match: match.number, ply: before.history.length - 1, move: encodeMove(after.lastMove) };
        setPending(move);
        void send(move);
      }
    },
    [canMove, match, send],
  );

  return { state, me, started, startsIn: Math.max(0, startsIn), winner, drawn, ending, myTurn, canMove, pending: pending !== null, click };
}
