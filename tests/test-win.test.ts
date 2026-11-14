// The development only ?testwin= helper (D60): its recorded games are made by
// the real engine (the file is exactly what the generator makes), every one
// replays on the server's own replay as a complete win for the player, and
// played through the reducer each ends on the result a real game would.
// UPDATE_TEST_WINS=1 npx vitest run tests/test-win.test.ts rewrites the file.
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { replayWin } from "../netlify/leaderboard/replay";
import { createGameState } from "../src/state/gameReducer";
import { playRecord } from "../src/state/playRecord";
import { isSubmittableWin } from "../src/ui/usePersonality";
import { qualifyingWin } from "../src/ui/leaderboard/useLeaderboardGame";
import { TEST_WIN_COUNT, decodeGame, generateTestWins } from "../src/ui/testWin/testWins";
import type { EncodedMove } from "../src/leaderboard/protocol";

const FILE = new URL("../src/ui/testWin/testWinGames.json", import.meta.url);

if (process.env["UPDATE_TEST_WINS"]) writeFileSync(FILE, `${JSON.stringify(generateTestWins())}\n`);

const stored = JSON.parse(readFileSync(FILE, "utf8")) as EncodedMove[][];

describe("the ?testwin= games", () => {
  it(`are the ${TEST_WIN_COUNT} games the engine generator makes, all different`, () => {
    expect(stored).toHaveLength(TEST_WIN_COUNT);
    expect(stored).toEqual(generateTestWins());
    expect(new Set(stored.map((game) => JSON.stringify(game))).size).toBe(TEST_WIN_COUNT);
  }, 120_000);

  it.each(stored.map((game, index) => [index, game] as const))("game %i replays on the server as a complete win for the player", (_index, game) => {
    const result = replayWin(game);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.moveCount).toBe(Math.ceil(game.length / 2));
  });

  it.each([1, 2, 3, 4] as const)("played through the reducer at level %i, the game ends as a submittable win", (level) => {
    const state = playRecord(createGameState({ mode: "vs-ai", aiLevel: level }), decodeGame(stored[level - 1]!));
    expect(state.winner).toBe("black");
    expect(state.resignedBy).toBeNull();
    expect(state.aiPhase).toBe("idle"); // no AI request is left to send
    expect(state.aiLevel).toBe(level);
    expect(isSubmittableWin(state)).toBe(true);
    expect(qualifyingWin(state, "00000000-0000-4000-8000-000000000001")).toEqual({
      gameId: "00000000-0000-4000-8000-000000000001",
      level,
      moves: stored[level - 1],
    });
  });

  it("a move that is not in the record's position is refused, not played", () => {
    const moves = decodeGame(stored[0]!);
    expect(() => playRecord(createGameState({ mode: "vs-ai" }), [moves[1]!, ...moves])).toThrow(/could not be played/);
    expect(() => decodeGame([[0, 1]])).toThrow(/not legal/);
  });
});
