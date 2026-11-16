// The browser's side of online rooms (D91 to D93): room codes as typed or
// linked, joining the server's moves to the browser's, how often to ask,
// the board following the server, and the words of the game and its end.
import { describe, expect, it } from "vitest";
import { applyMove, getLegalMoves, initialBoard } from "../../src/engine";
import { encodeMove } from "../../src/leaderboard/protocol";
import { isRoomCode, normalizeRoomCode, roomCodeFromSearch } from "../../src/online/protocol";
import { freshGame, onlineBoardView, syncGame } from "../../src/ui/online/onlineBoard";
import { endReason, namesOf, phaseOf } from "../../src/ui/online/onlineText";
import { HIDDEN_POLL_MS, mergeGame, NO_GAME, pollDelay } from "../../src/ui/online/roomSync";
import { createGameState } from "../../src/state/gameReducer";
import { BLACK_WIN } from "../leaderboard/fixtures";
import { roomView } from "./views";

describe("room codes in the browser", () => {
  it("are tidied as typed or pasted: capitals, no spaces or marks, six at most", () => {
    expect(normalizeRoomCode(" k7q-h3m ")).toBe("K7QH3M");
    expect(normalizeRoomCode("k7qh3mxyz")).toBe("K7QH3M");
    expect(isRoomCode("K7QH3M")).toBe(true);
    expect(isRoomCode("K7QH0M")).toBe(false);
  });

  it("come from a shared link, and a bad one is ignored", () => {
    expect(roomCodeFromSearch("?room=k7qh3m")).toBe("K7QH3M");
    expect(roomCodeFromSearch("?room=nope")).toBeNull();
    expect(roomCodeFromSearch("?lb=populated")).toBeNull();
  });
});

describe("joining the server's moves to the browser's", () => {
  const view = (moves: readonly (readonly number[])[], from: number, moveCount: number, number = 1) =>
    roomView({ match: { number, startsInMs: 0, moveCount, from, moves, toMove: moveCount % 2 === 0 ? "black" : "white", winner: null, reason: null } });

  it("adds the new moves after the ones the browser has", () => {
    const first = mergeGame(NO_GAME, view(BLACK_WIN.slice(0, 2), 0, 2));
    expect(first).toEqual({ game: { match: 1, moves: BLACK_WIN.slice(0, 2) }, gap: false });
    const next = mergeGame(first.game, view(BLACK_WIN.slice(2, 3), 2, 3));
    expect(next.game.moves).toEqual(BLACK_WIN.slice(0, 3));
  });

  it("the server's moves replace the browser's from where they start (a refused move goes)", () => {
    const local = { match: 1, moves: [...BLACK_WIN.slice(0, 2), [9, 18]] };
    expect(mergeGame(local, view([BLACK_WIN[2]!], 2, 3)).game.moves).toEqual(BLACK_WIN.slice(0, 3));
  });

  it("a view that starts after what the browser has is a gap: ask again from the start", () => {
    expect(mergeGame({ match: 1, moves: [] }, view(BLACK_WIN.slice(4, 5), 4, 5)).gap).toBe(true);
    // A new game in the room: the browser forgets the old one's moves.
    const rematch = mergeGame({ match: 1, moves: BLACK_WIN.slice(0, 9) }, view([], 0, 0, 2));
    expect(rematch).toEqual({ game: { match: 2, moves: [] }, gap: false });
  });

  it("no game yet: nothing", () => {
    expect(mergeGame({ match: 1, moves: BLACK_WIN }, roomView({ status: "waiting", match: null })).game).toEqual(NO_GAME);
  });
});

describe("how often to ask", () => {
  it("about every second in a game, slower while waiting or after it, never once the room has ended", () => {
    expect(pollDelay("playing", false)).toBe(1000);
    expect(pollDelay("ready", false)).toBe(1000);
    expect(pollDelay("waiting", false)).toBe(2000);
    expect(pollDelay("finished", false)).toBe(2000);
    expect(pollDelay("closed", false)).toBeNull();
    expect(pollDelay("expired", true)).toBeNull();
  });

  it("only a sign of life every 5 seconds while the tab is hidden", () => {
    expect(pollDelay("playing", true)).toBe(HIDDEN_POLL_MS);
    expect(pollDelay("waiting", true)).toBe(HIDDEN_POLL_MS);
  });
});

describe("the board follows the server", () => {
  it("plays the moves it lacks through the reducer, keeping the state when nothing changed", () => {
    const start = freshGame();
    expect(syncGame(start, [])).toBe(start);
    const two = syncGame(start, BLACK_WIN.slice(0, 2));
    expect(two.movesPlayed).toBe(2);
    expect(two.currentPlayer).toBe("black");
    expect(syncGame(two, BLACK_WIN.slice(0, 2))).toBe(two);
    const three = syncGame(two, BLACK_WIN.slice(0, 3));
    expect(three.history.slice(0, 3)).toEqual(two.history);
  });

  it("rebuilds from the server when the browser's own move was refused", () => {
    const board = initialBoard();
    const mine = getLegalMoves(board, "black")[1]!;
    const local = syncGame(freshGame(), [encodeMove(mine)]);
    const server = syncGame(local, BLACK_WIN.slice(0, 1));
    expect(server.history[1]!.board).toEqual(applyMove(board, getLegalMoves(board, "black").find((move) => encodeMove(move).join() === BLACK_WIN[0]!.join())!));
  });

  it("plays a whole game to its end", () => {
    const end = syncGame(freshGame(), BLACK_WIN);
    expect(end.winner).toBe("black");
  });

  it("puts your pieces at the bottom, and offers nothing to pick up out of turn", () => {
    const base = { board: initialBoard(), selected: null, selectable: [{ row: 5, col: 0 }], mustCapture: [], destinations: [], routeChoices: [], lastMove: null, locked: false };
    expect(onlineBoardView(base, "white", true)).toMatchObject({ flipped: true, locked: false, selectable: [{ row: 5, col: 0 }] });
    expect(onlineBoardView(base, "black", false)).toMatchObject({ flipped: false, locked: true, selectable: [] });
  });
});

describe("the words of an online game", () => {
  const view = roomView();
  const names = namesOf(view, "black");
  const board = createGameState().board;

  it("calls you You and the opponent by their username", () => {
    expect(names).toEqual({ black: "You", white: "Zara_K" });
    expect(namesOf(view, "white")).toEqual({ black: "Zara_K", white: "You" });
  });

  it("says why the game ended, from either side", () => {
    expect(endReason("resign", "black", "black", names, board)).toBe("Zara_K resigned.");
    expect(endReason("resign", "white", "black", names, board)).toBe("You resigned.");
    expect(endReason("forfeit", "black", "black", names, board)).toBe("Zara_K was gone too long, so the game is yours.");
    expect(endReason("left", "white", "black", names, board)).toBe("You left the room.");
    expect(endReason("board", "black", "black", names, board)).toBe("Zara_K has no legal moves.");
  });

  it("the status line: the countdown, whose turn, the disconnect countdown and the end", () => {
    const base = { view, me: "black" as const, names, board, winner: null, startsIn: 0, myTurn: true, choosingRoute: false, sending: false, forfeitIn: null };
    expect(phaseOf({ ...base, startsIn: 2100 })).toEqual({ kind: "starting", seconds: 3 });
    expect(phaseOf(base)).toEqual({ kind: "yourTurn", choosingRoute: false });
    expect(phaseOf({ ...base, myTurn: false, sending: true })).toEqual({ kind: "theirTurn", sending: true });
    expect(phaseOf({ ...base, forfeitIn: 41_200 })).toEqual({ kind: "disconnected", seconds: 42 });
    expect(phaseOf({ ...base, winner: "white", view: roomView({ match: { ...view.match!, winner: "white", reason: "resign" } }) })).toMatchObject({ kind: "over", winnerName: "Zara_K", reason: "You resigned." });
    expect(phaseOf({ ...base, view: roomView({ status: "closed", opponent: { ...view.opponent!, left: true } }) })).toEqual({ kind: "closed", text: "Zara_K left the room." });
  });
});
