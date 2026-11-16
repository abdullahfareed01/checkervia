import { memo } from "react";
import type { ReactNode } from "react";
import { BackIcon, CrownIcon, LaurelIcon } from "./icons";

// The title. Large (the home screen): a crown above it and a laurel branch
// on each side. Otherwise (the game and Learn, D65): the splash screen's
// look, a cream serif name over a gold rule with a crown in the middle.
export const GameTitle = memo(function GameTitle({ text, large = false }: { text: string; large?: boolean }) {
  if (!large) {
    return (
      <div className="game-title game-title-splash">
        <h1>{text}</h1>
        <span className="game-title-rule" aria-hidden="true">
          <span />
          <CrownIcon />
          <span />
        </span>
      </div>
    );
  }
  return (
    <div className={`game-title${large ? " game-title-large" : ""}`}>
      <span className="game-title-crown">
        <CrownIcon />
      </span>
      <span className="game-title-row">
        <LaurelIcon />
        <h1>{text}</h1>
        <LaurelIcon flip />
      </span>
    </div>
  );
});

interface TopBarProps {
  title: string;
  onBack?: (() => void) | undefined; // a back arrow, where it is the only way out (Learn)
  action?: ReactNode; // the game's Menu, top right, on one column screens
}

// The bar at the top of the game and Learn screens: the title, and on Learn
// a back arrow to the main menu. The game has no back arrow: its Menu has
// "Main menu" (D50); on one column screens that Menu sits at the top right.
export const TopBar = memo(function TopBar({ title, onBack, action }: TopBarProps) {
  return (
    <div className="top-row">
      {onBack ? (
        <button type="button" className="icon-button" aria-label="Back to the main menu" onClick={onBack}>
          <BackIcon />
        </button>
      ) : (
        <span className="icon-button-space" aria-hidden="true" />
      )}
      <GameTitle text={title} />
      {action ?? <span className="icon-button-space" aria-hidden="true" />}
    </div>
  );
});
