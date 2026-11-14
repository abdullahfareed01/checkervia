import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { RestartIcon } from "./icons";

interface NewGameButtonProps {
  // True while a game is in progress, so a restart would throw it away.
  needsConfirmation: boolean;
  onNewGame: () => void;
}

// Starts a new game, last on the action bar. If a game is in progress, asks
// first in a confirmation sheet (so nothing on the bar moves).
export function NewGameButton({ needsConfirmation, onNewGame }: NewGameButtonProps) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" className="bar-button bar-button-primary" onClick={needsConfirmation ? () => setAsking(true) : onNewGame}>
        <RestartIcon />
        <span className="bar-label">New game</span>
      </button>
      {asking && (
        <ConfirmDialog
          question="Start a new game? The current game will be lost."
          confirmLabel="Yes, new game"
          icon={<RestartIcon />}
          onConfirm={() => {
            setAsking(false);
            onNewGame();
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
