import { memo } from "react";
import { BackIcon, CrownIcon, LaurelIcon } from "./icons";

// The title with a crown above it and a laurel branch on each side.
export const GameTitle = memo(function GameTitle({ text, large = false }: { text: string; large?: boolean }) {
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
}

// The bar at the top of the game and Learn screens: the title, and on Learn
// a back arrow to the main menu. The game has no back arrow: its Menu (in
// the action bar) has "Main menu" (D50).
export const TopBar = memo(function TopBar({ title, onBack }: TopBarProps) {
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
      <span className="icon-button-space" aria-hidden="true" />
    </div>
  );
});
