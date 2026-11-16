// Development only (D60): /?testwin=easy|medium|hard|strongest opens a game
// against the AI at that level that has already been won by the player,
// from one of the recorded games in testWinGames.json. The game is played
// through the reducer, so the normal result panel opens and adds the win by
// itself through the real submit-win function (which replays the game on
// the server as usual, D61). Without a profile, the Profile screen comes
// first. Never in a production build.
//
// Each visit takes the next recorded game for that level (kept in this
// browser), because the server refuses the same moves twice from one player
// on one level. &game=1 to &game=20 picks one.
//
// &side=white (D81): a game won as White instead, where the AI (Black) made
// the first move. It is made on the spot by the same engine generator, and
// the win is sent with its colour, so the server's replay for White is
// tested for real. &side=black is the default. Each visit takes the next
// seed (&game=N picks seed N); the result panel sends it as usual.
import type { AiLevel } from "../../ai/difficulty";
import type { Player } from "../../engine";
import type { EncodedMove } from "../../leaderboard/protocol";
import type { GameOptions } from "../../state/gameReducer";
import games from "./testWinGames.json";
import { decodeGame, findTestWin } from "./testWins";

const LEVEL_NAMES: Record<string, AiLevel> = { easy: 1, medium: 2, hard: 3, strongest: 4 };
const NEXT_KEY = "checkervia.dev.testwin";

// The next game for a level (and colour), counting on in this browser.
function nextIndex(key: string, count: number): number {
  try {
    const next = JSON.parse(localStorage.getItem(NEXT_KEY) ?? "{}") as Record<string, number>;
    const index = (next[key] ?? 0) % count;
    localStorage.setItem(NEXT_KEY, JSON.stringify({ ...next, [key]: index + 1 }));
    return index;
  } catch {
    return 0;
  }
}

const WHITE_SEEDS = 1000;

/** A game won as White, made on the spot: seed `&game=N`, else the next one. */
function whiteWinOptions(level: AiLevel, gameNumber: string | null): GameOptions | undefined {
  const chosen = Number(gameNumber);
  const seed = Number.isInteger(chosen) && chosen >= 1 ? chosen - 1 : nextIndex(`${level}:white`, WHITE_SEEDS);
  const found = findTestWin(seed, "white");
  if (!found) {
    console.warn(`?testwin: no win as White from seed ${seed + 1}.`);
    return undefined;
  }
  console.info(`?testwin: a win as White from seed ${found.seed + 1}, the AI (Black) moved first.`);
  return { mode: "vs-ai", aiLevel: level, humanSide: "white", record: decodeGame(found.moves) };
}

/** The game to open for ?testwin=...&side=..., or undefined for an unknown level or side. */
export function testWinOptions(levelName: string, gameNumber: string | null, sideName: string | null = null): GameOptions | undefined {
  const level = LEVEL_NAMES[levelName.toLowerCase()];
  if (!level) {
    console.warn(`?testwin=${levelName}: use easy, medium, hard or strongest.`);
    return undefined;
  }
  const side: Player | null = sideName === null || sideName === "black" ? "black" : sideName === "white" ? "white" : null;
  if (!side) {
    console.warn(`?testwin side=${sideName}: use side=white or side=black.`);
    return undefined;
  }
  if (side === "white") return whiteWinOptions(level, gameNumber);
  const chosen = Number(gameNumber);
  const index = Number.isInteger(chosen) && chosen >= 1 && chosen <= games.length ? chosen - 1 : nextIndex(String(level), games.length);
  console.info(`?testwin: recorded game ${index + 1} of ${games.length} at level ${levelName}.`);
  return { mode: "vs-ai", aiLevel: level, humanSide: "black", record: decodeGame((games as EncodedMove[][])[index]!) };
}
