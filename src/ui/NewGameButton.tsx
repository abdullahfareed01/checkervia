import { ConfirmButton } from "./ConfirmButton";

interface NewGameButtonProps {
  // True while a game is in progress, so a restart would throw it away.
  needsConfirmation: boolean;
  onNewGame: () => void;
}

// Starts a new game. If a game is in progress, asks first.
export function NewGameButton({ needsConfirmation, onNewGame }: NewGameButtonProps) {
  return (
    <ConfirmButton
      label="New game"
      className="button-primary"
      needsConfirmation={needsConfirmation}
      question="Start a new game? The current game will be lost."
      confirmLabel="Yes, new game"
      onConfirm={onNewGame}
    />
  );
}
