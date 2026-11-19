// The online screens with sample rooms, for the screen tests and the no
// dashes test.
import { createElement } from "react";
import type { ReactElement } from "react";
import { ResultDialog } from "../../src/ui/ResultDialog";
import { OnlineGame } from "../../src/ui/online/OnlineGame";
import { OnlineStatus } from "../../src/ui/online/OnlineStatus";
import type { OnlinePhase } from "../../src/ui/online/OnlineStatus";
import { ReadyOverlay } from "../../src/ui/online/ReadyOverlay";
import { RematchActions } from "../../src/ui/online/RematchActions";
import { RoomPage } from "../../src/ui/online/RoomPage";
import { TwoPlayerSheet } from "../../src/ui/online/TwoPlayerSheet";
import { WaitingRoom } from "../../src/ui/online/WaitingRoom";
import { connection, roomView } from "./views";

const noop = () => {};

export const sheet = (step: Parameters<typeof TwoPlayerSheet>[0]["step"]) =>
  createElement(TwoPlayerSheet, { step, onStep: noop, onSameScreen: noop, onOnline: noop, onRoom: noop, onClose: noop });
export const waiting = roomView({ status: "waiting", opponent: null, match: null, you: { username: "You_Player", avatar: "a12", country: "GB", colour: null } });
const finished = roomView({ status: "finished", match: { number: 1, startsInMs: 0, moveCount: 0, from: 0, moves: [], toMove: "black", winner: "white", reason: "resign" } });
export const result = (online: boolean) =>
  createElement(ResultDialog, {
    winner: "white",
    mode: "two-player",
    reason: "You resigned.",
    stats: { black: { moves: 10, captured: 2, kingsMade: 0, bestChain: 1 }, white: { moves: 10, captured: 3, kingsMade: 1, bestChain: 2 } },
    pieces: { black: 9, white: 10 },
    totalMoves: 20,
    durationMs: 120_000,
    onPlayAgain: noop,
    onReview: noop,
    onClose: noop,
    ...(online
      ? {
          online: {
            me: "black" as const,
            names: { black: "You", white: "Zara_K" },
            avatars: { black: "a12", white: "a05" },
            subtitle: "Good game. Want a rematch?",
            actions: createElement(RematchActions, { view: finished, theirName: "Zara_K", onRematch: noop, onLeave: noop }),
          },
        }
      : {}),
  });

const PHASES: OnlinePhase[] = [
  { kind: "starting", seconds: 3 },
  { kind: "yourTurn", choosingRoute: true },
  { kind: "theirTurn", sending: true },
  { kind: "disconnected", seconds: 42 },
  { kind: "over", winner: "white", winnerName: "Zara_K", reason: "You resigned." },
  { kind: "closed", text: "Zara_K left the room." },
];

export const ONLINE_SCREENS: [string, ReactElement][] = [
  ["2 players sheet", sheet({ kind: "choose" })],
  ["online choice", sheet({ kind: "online" })],
  ["join", sheet({ kind: "join", code: "k7q h3m", autoJoin: false })],
  ["waiting room", createElement(WaitingRoom, { room: connection(waiting), onLeave: noop })],
  ["waiting room paused", createElement(WaitingRoom, { room: connection(waiting, { paused: true }), onLeave: noop })],
  ["ready", createElement(ReadyOverlay, { view: roomView({ status: "ready" }), seconds: 3 })],
  ["rematch ready", createElement(ReadyOverlay, { view: roomView({ status: "ready", match: { ...roomView().match!, number: 2 } }), seconds: 4 })],
  ["online game", createElement(OnlineGame, { room: connection(roomView()), onLeave: noop })],
  ["room opening", createElement(RoomPage, { code: "K7QH3M", first: null, onHome: noop })],
  ["online result", result(true)],
  ...PHASES.map((phase): [string, ReactElement] => [`status: ${phase.kind}`, createElement(OnlineStatus, { phase, problem: null })]),
  ["status: offline", createElement(OnlineStatus, { phase: { kind: "theirTurn", sending: false }, problem: { kind: "offline" } })],
  ...(["none", "you", "opponent"] as const).map((rematch): [string, ReactElement] => [
    `rematch: ${rematch}`,
    createElement(RematchActions, { view: { ...finished, rematch }, theirName: "Zara_K", onRematch: noop, onLeave: noop }),
  ]),
  ["rematch: friend left", createElement(RematchActions, { view: { ...finished, status: "closed", opponent: { ...finished.opponent!, left: true } }, theirName: "Zara_K", onRematch: noop, onLeave: noop })],
];

