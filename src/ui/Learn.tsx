import { useCallback, useMemo } from "react";
import type { Player } from "../engine";
import { buildFrames } from "../learn/frames";
import type { Frame } from "../learn/frames";
import { LESSONS } from "../learn/lessons";
import type { HistoryTarget } from "../state/gameReducer";
import { pieceCounts } from "../state/selectors";
import { FactList } from "./AiReasonDialog";
import { Board } from "./Board";
import type { BoardView } from "./Board";
import { PlayerCard } from "./PlayerCard";
import { TopBar } from "./TopBar";
import { useAnimationKey, useHistoryKeys } from "./useHistoryView";
import { useLessonPlayer } from "./useLessonPlayer";

const ROBOT_NAMES: Record<Player, string> = { black: "Gold Bot", white: "Cyan Bot" };

// The board only shows the lesson: nothing can be clicked.
function boardViewOf(frame: Frame, moveKey: number): BoardView {
  return {
    board: frame.board,
    selected: null,
    selectable: [],
    mustCapture: [...frame.mustCapture],
    destinations: [],
    routeChoices: [],
    lastMove: frame.move,
    locked: true,
    previousBoard: frame.previousBoard,
    moveKey,
  };
}

function card(frame: Frame, player: Player, placement: "top" | "bottom") {
  return (
    <PlayerCard
      player={player}
      name={ROBOT_NAMES[player]}
      robot
      pieces={pieceCounts(frame.board)[player]}
      captured={frame.captured[player]}
      toMove={frame.winner === null && frame.toMove === player}
      thinking={false}
      winner={frame.winner === player}
      placement={placement}
    />
  );
}

// Learn mode: two robots play short scripted scenes, one rule at a time, with
// a caption for every move and the facts the engine can confirm.
export function Learn({ onMenu }: { onMenu: () => void }) {
  const frames = useMemo(() => buildFrames(LESSONS), []);
  const player = useLessonPlayer(frames);
  const { frame, go } = player;
  const moveKey = useAnimationKey(player.index);
  const sceneSteps = LESSONS[frame.sceneIndex]!.steps.length;
  // The same keys as the game's history: Left, Right, Home, End.
  const onKey = useCallback((to: HistoryTarget) => {
    if (typeof to === "string") go(to);
  }, [go]);
  useHistoryKeys(onKey, true);

  return (
    <main className="app learn">
      <header className="topbar">
        <TopBar title="Learn" onBack={onMenu} items={[{ label: "Main menu", onSelect: onMenu }]} />
      </header>

      <section className="game" aria-label="Lesson board">
        {card(frame, "white", "top")}
        <Board view={boardViewOf(frame, moveKey)} onSquareClick={() => {}} />
        {card(frame, "black", "bottom")}
      </section>

      <aside className="sidebar">
        <section className="lesson" aria-live="polite">
          <p className="lesson-count">
            Lesson {frame.sceneIndex + 1} of {LESSONS.length}
            <span className="lesson-step">{frame.stepIndex === 0 ? "Intro" : `Move ${frame.stepIndex} of ${sceneSteps}`}</span>
          </p>
          <h2 className="lesson-title">{frame.title}</h2>
          <p className="lesson-caption">{frame.caption}</p>
          {frame.facts.length > 0 && (
            <div className="lesson-facts">
              <h3>Checked by the game engine</h3>
              <FactList facts={frame.facts} />
            </div>
          )}
        </section>

        <div className="lesson-controls" role="group" aria-label="Playback">
          <button type="button" className="history-arrow" aria-label="Previous" title="Previous" disabled={player.index === 0} onClick={() => go("back")}>
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" className="button button-primary lesson-play" onClick={player.togglePlay}>
            {player.atEnd ? "Watch again" : player.playing ? "Pause" : "Play"}
          </button>
          <button type="button" className="history-arrow" aria-label="Next" title="Next" disabled={player.atEnd} onClick={() => go("forward")}>
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <ol className="lesson-list" aria-label="Lessons">
          {LESSONS.map((scene, i) => (
            <li key={scene.title}>
              <button
                type="button"
                className={`lesson-link${i === frame.sceneIndex ? " lesson-link-current" : ""}`}
                aria-current={i === frame.sceneIndex ? "step" : undefined}
                onClick={() => go({ scene: i })}
              >
                <span className="lesson-link-number">{i + 1}</span>
                {scene.title}
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}
