// Room views and connections as the screens get them, for the online
// screen tests and the no dashes test.
import type { RoomView } from "../../src/online/protocol";
import type { RoomConnection } from "../../src/ui/online/useRoom";
import { mergeGame, NO_GAME } from "../../src/ui/online/roomSync";

const noop = () => {};
const answered = async () => ({ kind: "offline" as const });

export function roomView(change: Partial<RoomView> = {}): RoomView {
  return {
    code: "K7QH3M",
    status: "playing",
    host: true,
    you: { username: "You_Player", avatar: "a12", country: "GB", colour: "black" },
    opponent: { username: "Zara_K", avatar: "a05", country: "PK", colour: "white", presence: "online", forfeitInMs: null, left: false },
    match: { number: 1, startsInMs: 0, moveCount: 0, from: 0, moves: [], toMove: "black", winner: null, reason: null },
    rematch: "none",
    ...change,
  };
}

export function connection(view: RoomView | null, change: Partial<RoomConnection> = {}): RoomConnection {
  return {
    view,
    game: view ? mergeGame(NO_GAME, view).game : NO_GAME,
    receivedAt: Date.now(),
    problem: null,
    refusal: null,
    paused: false,
    sendMove: answered,
    resign: answered,
    rematch: answered,
    leave: async () => {},
    keepWaiting: noop,
    ...change,
  };
}
