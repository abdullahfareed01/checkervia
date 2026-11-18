import type { Piece as PieceType } from "../engine";
import { useCosmeticSides } from "./CosmeticAppearance";

interface PieceProps {
  piece: PieceType;
  // Hidden but still taking up space, e.g. while the move animation is
  // still on its way to this square.
  hidden?: boolean;
}

// A CSS disc. Kings get a gold crown and ring (see styles.css), so they do not
// rely on colour alone. The square's button carries the accessible label.
export function Piece({ piece, hidden = false }: PieceProps) {
  const finish = useCosmeticSides()[piece.player];
  const classes = [
    "piece",
    `piece-${piece.player}`,
    piece.kind === "king" && "piece-king",
    hidden && "piece-hidden",
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={classes} data-piece-finish={finish.pieces} data-piece-effect={finish.effect} aria-hidden="true">
    {finish.effect !== "classic" && <span className={`cosmetic-fx cosmetic-fx-${finish.effect}`}><i /><i /><i /></span>}
  </div>;
}
