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
import type { AiLevel } from "../../ai/difficulty";
import type { EncodedMove } from "../../leaderboard/protocol";
import type { GameOptions } from "../../state/gameReducer";
import games from "./testWinGames.json";
import { decodeGame } from "./testWins";

const LEVEL_NAMES: Record<string, AiLevel> = { easy: 1, medium: 2, hard: 3, strongest: 4 };
const NEXT_KEY = "checkervia.dev.testwin";

function nextIndex(level: AiLevel): number {
  try {
    const next = JSON.parse(localStorage.getItem(NEXT_KEY) ?? "{}") as Record<string, number>;
    const index = (next[level] ?? 0) % games.length;
    localStorage.setItem(NEXT_KEY, JSON.stringify({ ...next, [level]: index + 1 }));
    return index;
  } catch {
    return 0;
  }
}

/** The game to open for ?testwin=..., or undefined for an unknown level. */
export function testWinOptions(levelName: string, gameNumber: string | null): GameOptions | undefined {
  const level = LEVEL_NAMES[levelName.toLowerCase()];
  if (!level) {
    console.warn(`?testwin=${levelName}: use easy, medium, hard or strongest.`);
    return undefined;
  }
  const chosen = Number(gameNumber);
  const index = Number.isInteger(chosen) && chosen >= 1 && chosen <= games.length ? chosen - 1 : nextIndex(level);
  console.info(`?testwin: recorded game ${index + 1} of ${games.length} at level ${levelName}.`);
  return { mode: "vs-ai", aiLevel: level, record: decodeGame((games as EncodedMove[][])[index]!) };
}
