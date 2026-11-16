// D81: random colours against the AI. Every new game gives the player Black
// or White (one chance in two). Black always moves first, so as White the AI
// opens. The player's pieces are always at the bottom: the board turns round
// for White, with its coordinates; the rules, the square names and the move
// notation do not change.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyMove, getLegalMoves, initialBoard, squareName } from "../src/engine";
import type { Move, Player } from "../src/engine";
import { encodeMove } from "../src/leaderboard/protocol";
import { aiSideOf, createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameState, HistoryEntry } from "../src/state/gameReducer";
import { playRecord } from "../src/state/playRecord";
import { randomSide } from "../src/state/sides";
import { aiMood } from "../src/ui/aiMood";
import { App } from "../src/ui/App";
import { Board } from "../src/ui/Board";
import type { BoardView } from "../src/ui/Board";
import { boardViewOf } from "../src/ui/gameView";
import { isLeaderboardGame, qualifyingWin } from "../src/ui/leaderboard/useLeaderboardGame";
import { flipBoard, flipMove, flipPosition } from "../src/ui/moveGeometry";
import { moveText } from "../src/ui/notation";
import { SideIntro, sideIntroText } from "../src/ui/SideIntro";
import { endContext, isSubmittableWin } from "../src/ui/usePersonality";
import { WinChanceBar } from "../src/ui/WinChanceBar";
import { displayedPosition } from "../src/state/history";
import { WHITE_WIN } from "./leaderboard/fixtures";

const asWhite = () => createGameState({ mode: "vs-ai", aiLevel: 2, humanSide: "white" });

// A finished game from encoded moves, Black first, for the given colour.
function playedGame(moves: readonly (readonly number[])[], humanSide: Player): GameState {
  const base = createGameState({ mode: "vs-ai", aiLevel: 4, humanSide });
  let board = base.board;
  let player: Player = "black";
  const history: HistoryEntry[] = [{ board, move: null, player: null }];
  for (const encoded of moves) {
    const move = getLegalMoves(board, player).find((legal) => JSON.stringify(encodeMove(legal)) === JSON.stringify(encoded)) as Move;
    board = applyMove(board, move);
    history.push({ board, move, player });
    player = player === "black" ? "white" : "black";
  }
  return { ...base, board, history, winner: humanSide, currentPlayer: player, legalMoves: [], aiPhase: "idle" };
}

describe("the colour of a new game", () => {
  it("is Black or White, one chance in two", () => {
    expect([randomSide(() => 0), randomSide(() => 0.49), randomSide(() => 0.5), randomSide(() => 0.99)]).toEqual(["black", "black", "white", "white"]);
    let white = 0;
    let seed = 7;
    const random = () => ((seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647);
    for (let game = 0; game < 4_000; game++) if (randomSide(random) === "white") white += 1;
    expect(white / 4_000).toBeGreaterThan(0.45);
    expect(white / 4_000).toBeLessThan(0.55);
  });

  it("New game, Play vs AI and the mode switch all pick a new random colour; Home does too", () => {
    const useGame = readFileSync(new URL("../src/state/useGame.ts", import.meta.url), "utf8");
    expect(useGame).toContain('dispatch({ type: "newGame", humanSide: randomSide() })');
    expect(useGame).toContain('dispatch({ type: "newGame", mode: "vs-ai", level, humanSide: randomSide() })');
    expect(useGame).toContain('dispatch({ type: "setMode", mode, humanSide: randomSide() })');
    const root = readFileSync(new URL("../src/ui/Root.tsx", import.meta.url), "utf8");
    expect(root).toMatch(/const humanSide = randomSide\(\);[\s\S]{0,120}options: \{ mode, aiLevel: level, humanSide \}/);
  });

  it("the reducer takes the colour from the action, and keeps Black when none is given", () => {
    const start = createGameState({ mode: "vs-ai" });
    expect(start.humanSide).toBe("black");
    expect(gameReducer(start, { type: "newGame", humanSide: "white" }).humanSide).toBe("white");
    expect(gameReducer(start, { type: "newGame" }).humanSide).toBe("black");
    expect(gameReducer(createGameState(), { type: "setMode", mode: "vs-ai", humanSide: "white" }).humanSide).toBe("white");
  });

  it("two player games are unchanged: Black moves first, nobody is the AI", () => {
    const twoPlayer = gameReducer(createGameState(), { type: "newGame", humanSide: "white" });
    expect(twoPlayer).toMatchObject({ mode: "two-player", humanSide: "black", currentPlayer: "black", aiPhase: "idle" });
    expect(boardViewOf(twoPlayer, displayedPosition(twoPlayer), 0).flipped).toBe(false);
  });
});

describe("playing White: the AI moves first", () => {
  it("the AI thinks at once, then it is the player's turn", () => {
    const state = asWhite();
    expect(state).toMatchObject({ currentPlayer: "black", aiPhase: "thinking", humanSide: "white" });
    expect(aiSideOf(state)).toBe("black");
    const opening = state.legalMoves[0]!;
    const after = gameReducer(state, { type: "aiMoved", requestId: state.aiRequestId, move: opening });
    expect(after).toMatchObject({ currentPlayer: "white", aiPhase: "idle", movesPlayed: 1 });
    expect(after.history[1]).toMatchObject({ player: "black", move: opening, level: 2 });
    // The player cannot move for the AI while it thinks.
    expect(gameReducer(state, { type: "click", position: opening.from })).toBe(state);
  });

  it("a recorded White game plays the AI's moves as its replies and the player's as clicks", () => {
    const opening = WHITE_WIN.slice(0, 6);
    const moves: Move[] = [];
    let board = initialBoard();
    let player: Player = "black";
    for (const encoded of opening) {
      const move = getLegalMoves(board, player).find((legal) => JSON.stringify(encodeMove(legal)) === JSON.stringify(encoded))!;
      moves.push(move);
      board = applyMove(board, move);
      player = player === "black" ? "white" : "black";
    }
    const state = playRecord(asWhite(), moves);
    expect(state.history.map((entry) => entry.player)).toEqual([null, "black", "white", "black", "white", "black", "white"]);
    expect(state.history.filter((entry) => entry.player === "black").every((entry) => entry.level === 2)).toBe(true);
  });

  it("resigning as White gives the game to Black (the AI), as Black to White", () => {
    const white = gameReducer(asWhite(), { type: "resign" });
    expect(white).toMatchObject({ resignedBy: "white", winner: "black" });
    expect(endContext(white)).toBe("resigned");
    const black = gameReducer(createGameState({ mode: "vs-ai" }), { type: "resign" });
    expect(black).toMatchObject({ resignedBy: "black", winner: "white" });
    expect([isSubmittableWin(white), isSubmittableWin(black)]).toEqual([false, false]);
  });

  it("a White win is the player's win, sent with its colour and every move from the AI's first", () => {
    const won = playedGame(WHITE_WIN, "white");
    expect(endContext(won)).toBe("playerWon");
    expect(isSubmittableWin(won)).toBe(true);
    expect(isLeaderboardGame(won)).toBe(true);
    expect(qualifyingWin(won, "00000000-0000-4000-8000-000000000042")).toEqual({
      gameId: "00000000-0000-4000-8000-000000000042",
      level: 4,
      colour: "white",
      moves: WHITE_WIN,
    });
    // The AI (Black) losing: the robot sulks.
    expect(aiMood(won)).toBe("defeated");
    expect(aiMood({ ...won, winner: "black" })).toBe("laughing");
  });

  it("no greeting when the AI opens (the greetings say 'your move first')", () => {
    const source = readFileSync(new URL("../src/ui/usePersonality.ts", import.meta.url), "utf8");
    expect(source).toContain("setGreeting(ai && state.currentPlayer === state.humanSide ? say(greetingContext(readSession().last)) : null);");
  });
});

describe("the board turned round for White", () => {
  it("screen squares are the board's turned by half a turn, and back again", () => {
    expect(flipPosition({ row: 0, col: 0 })).toEqual({ row: 7, col: 7 });
    expect(flipPosition({ row: 5, col: 2 })).toEqual({ row: 2, col: 5 });
    const board = initialBoard();
    expect(flipBoard(flipBoard(board))).toEqual(board);
    expect(flipBoard(board)[7]![0]).toEqual(board[0]![7]);
    const move = getLegalMoves(board, "black")[0]!;
    expect(flipMove(flipMove(move))).toEqual(move);
  });

  it("White's pieces at the bottom, moving up the screen; the names of the squares and the notation stay right", () => {
    const flipped = flipBoard(initialBoard());
    expect(flipped.slice(5).flat().filter(Boolean).every((piece) => piece!.player === "white")).toBe(true);
    expect(flipped.slice(0, 3).flat().filter(Boolean).every((piece) => piece!.player === "black")).toBe(true);
    const afterBlack = applyMove(initialBoard(), getLegalMoves(initialBoard(), "black")[0]!);
    for (const move of getLegalMoves(afterBlack, "white")) {
      const screen = flipMove(move);
      expect(screen.to.row).toBeLessThan(screen.from.row); // up the screen
      expect(moveText(move)).toBe(`${squareName(move.from)} → ${squareName(move.to)}`);
    }
  });

  function render(flipped: boolean): string {
    const state = flipped ? asWhite() : createGameState({ mode: "vs-ai" });
    const view: BoardView = boardViewOf(state, displayedPosition(state), 0);
    expect(view.flipped).toBe(flipped);
    return renderToStaticMarkup(createElement(Board, { view, onSquareClick: () => {} }));
  }
  const ranks = (html: string) => [...html.matchAll(/class="coord coord-rank"[^>]*>(\d)</g)].map((match) => match[1]);
  const files = (html: string) => [...html.matchAll(/class="coord coord-file"[^>]*>([A-H])</g)].map((match) => match[1]);
  const squares = (html: string) => [...html.matchAll(/aria-label="Row (\d), column (\d)/g)].map((match) => `${match[1]},${match[2]}`);

  it("the coordinates turn with the board: 1 to 8 down the left, H to A along the bottom", () => {
    const normal = render(false);
    expect(ranks(normal)).toEqual(["8", "7", "6", "5", "4", "3", "2", "1"]);
    expect(files(normal)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    const turned = render(true);
    expect(ranks(turned)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(files(turned)).toEqual(["H", "G", "F", "E", "D", "C", "B", "A"]);
  });

  it("each square keeps its own name (clicks and screen readers use the board's squares)", () => {
    const normal = squares(render(false));
    const turned = squares(render(true));
    expect(turned).toEqual([...normal].reverse());
    expect(turned[0]).toBe("8,7"); // the top left dark square is H1's corner turned round: row 8, column 7
    // Your White pieces are in the bottom rows on screen.
    const html = render(true);
    const lastRows = html.slice(html.lastIndexOf('aria-label="Row 3,'));
    expect(lastRows).toContain("white piece");
    expect(lastRows).not.toContain("black piece");
  });
});

describe("the game screen as White", () => {
  const html = renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 2, humanSide: "white" } }));

  it("the AI's card on top shows Black, yours at the bottom White; the AI is thinking", () => {
    const top = html.match(/<section class="card card-top[^"]*"[^>]*aria-label="([^"]+)"/)![1]!;
    const bottom = html.match(/<section class="card card-bottom[^"]*"[^>]*aria-label="([^"]+)"/)![1]!;
    expect(top).toMatch(/^AI, Black: Thinking\./);
    expect(bottom).toMatch(/^You, White: Waiting\./);
    expect(html).toContain("AI is thinking");
  });

  it("the banner says which colour you have and who moves first, floating over the board", () => {
    expect(html).toMatch(/<div class="side-intro side-intro-white" role="status" aria-live="polite">/);
    expect(html).toContain("You are White.");
    expect(html).toContain("The AI moves first.");
    expect(sideIntroText("black")).toEqual({ title: "You are Black.", detail: "You move first." });
    const css = readFileSync(new URL("../src/ui/sideIntro.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.side-intro \{[\s\S]*position: absolute;[\s\S]*pointer-events: none;/);
  });

  it("the banner goes once you have played a move", () => {
    const gone = renderToStaticMarkup(createElement(SideIntro, { side: "black", played: true }));
    expect(gone).toContain("side-intro-gone");
    expect(gone).not.toContain("You are Black.");
  });

  it("the win bar puts your colour at the bottom of the bar", () => {
    const bar = renderToStaticMarkup(createElement(WinChanceBar, { chance: 0.3, black: "AI", white: "You", bottom: "white" }));
    expect(bar).toContain('aria-label="Chance to win: You 70%, AI 30%"');
    expect(bar.indexOf("winbar-label-white")).toBeLessThan(bar.indexOf("winbar-label-black"));
    const normal = renderToStaticMarkup(createElement(WinChanceBar, { chance: 0.3, black: "You", white: "AI" }));
    expect(normal).toContain('aria-label="Chance to win: You 30%, AI 70%"');
  });

  it("as Black nothing changes: your card at the bottom, your turn, the board not turned", () => {
    const black = renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 2 } }));
    expect(black).toMatch(/<section class="card card-bottom[^"]*"[^>]*aria-label="You, Black: Your turn\./);
    expect(black).toContain("You are Black.");
    expect(black).toContain("You move first.");
  });
});
