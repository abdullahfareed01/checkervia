import { AI_LEVELS } from "../ai";
import type { AiLevel } from "../ai";
import type { GameMode } from "../state/gameReducer";
import { RobotIcon, TwoPlayersIcon } from "./icons";
import { LevelOptions } from "./LevelOptions";
import type { MenuRun } from "./GameMenu";

interface MenuSetupProps {
  mode: GameMode;
  level: AiLevel; // the current (or last chosen) AI level
  run: MenuRun; // closes the Menu sheet, asking first when needed
  // The question to ask before an action that ends the game, or undefined
  // when no game is in progress.
  loseQuestion: (what: string) => string | undefined;
  onTwoPlayers: () => void;
  onPlayAi: (level: AiLevel) => void; // a new game against the AI at `level`
}

// The top of the game's Menu sheet: the mode and the AI level, side by side
// in one place. A level is fixed for a game, so choosing one starts a new
// game against the AI at that level (asking first during a game).
export function MenuSetup({ mode, level, run, loseQuestion, onTwoPlayers, onPlayAi }: MenuSetupProps) {
  const chooseLevel = (next: AiLevel) => {
    if (mode === "vs-ai" && next === level) return run(undefined, () => {});
    run(loseQuestion(`Start a new game against the ${AI_LEVELS[next].name} AI?`), () => onPlayAi(next));
  };

  return (
    <div className="menu-setup">
      <p className="menu-section-title" id="menu-mode-title">
        Mode
      </p>
      <div className="segmented" role="group" aria-labelledby="menu-mode-title">
        <button
          type="button"
          className={`segment${mode === "two-player" ? " segment-on" : ""}`}
          aria-pressed={mode === "two-player"}
          onClick={() => mode !== "two-player" && run(loseQuestion("Switch to Two Players?"), onTwoPlayers)}
        >
          <TwoPlayersIcon />
          Two Players
        </button>
        <button
          type="button"
          className={`segment${mode === "vs-ai" ? " segment-on" : ""}`}
          aria-pressed={mode === "vs-ai"}
          onClick={() => mode !== "vs-ai" && run(loseQuestion("Play against the AI?"), () => onPlayAi(level))}
        >
          <RobotIcon />
          Play vs AI
        </button>
      </div>
      <p className="menu-section-title">
        AI level
        {/* In a two player game a level is a way into a game against the AI. */}
        {mode === "two-player" && <span className="menu-section-note">Tap one to play the AI</span>}
      </p>
      <LevelOptions value={level} onSelect={chooseLevel} compact />
    </div>
  );
}
