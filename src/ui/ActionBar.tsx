import { memo } from "react";
import type { ReactNode } from "react";
import type { HistoryTarget } from "../state/gameReducer";
import { ChevronIcon, TrophyIcon } from "./icons";
import { NewGameButton } from "./NewGameButton";
import { ResignButton } from "./ResignButton";

// The fourth slot: Resign during a game, "Result" once it is over (to open
// the result panel again), so the slot never moves or disappears.
export type EndAction =
  | { kind: "resign"; question: string; highlight: boolean; onResign: () => void }
  | { kind: "result"; onShow: () => void };

interface ActionBarProps {
  menu?: ReactNode; // the Menu button and its sheet; on one column screens it sits in the top bar (D74)
  canBack: boolean;
  canForward: boolean;
  onGo: (to: HistoryTarget) => void;
  end: EndAction;
  needsConfirmation: boolean; // New game would throw away a game in progress
  onNewGame: () => void;
}

// The game's actions in one bar (D50): Menu, Previous, Next, Resign (or
// Result) and New game, always in this order and the same size. On narrow
// screens it is fixed to the bottom of the screen, within reach of a thumb;
// on wide screens it is the bottom of the side panel. Nothing else on the
// page offers these buttons, so they never move between places. The one
// exception: where the bar is fixed to the bottom (one column), Menu sits at
// the top right instead and the bar keeps four buttons (owner, 15 Nov 2026).
export const ActionBar = memo(function ActionBar({ menu, canBack, canForward, onGo, end, needsConfirmation, onNewGame }: ActionBarProps) {
  return (
    <nav className="action-bar" aria-label="Game actions">
      <div className={`action-bar-inner${menu ? "" : " action-bar-four"}`}>
        {menu}
        <button type="button" className="bar-button" aria-label="Previous move" disabled={!canBack} onClick={() => onGo("back")}>
          <ChevronIcon direction="left" />
          <span className="bar-label" aria-hidden="true">
            Previous
          </span>
        </button>
        <button type="button" className="bar-button" aria-label="Next move" disabled={!canForward} onClick={() => onGo("forward")}>
          <ChevronIcon direction="right" />
          <span className="bar-label" aria-hidden="true">
            Next
          </span>
        </button>
        {end.kind === "resign" ? (
          <ResignButton question={end.question} highlight={end.highlight} onResign={end.onResign} />
        ) : (
          <button type="button" className="bar-button" onClick={end.onShow}>
            <TrophyIcon />
            <span className="bar-label">Result</span>
          </button>
        )}
        <NewGameButton needsConfirmation={needsConfirmation} onNewGame={onNewGame} />
      </div>
    </nav>
  );
});
