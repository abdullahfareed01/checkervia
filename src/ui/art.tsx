// Decorative art for the splash and the result panel (D51, after the
// mockups in mockup/). The pieces are SVG files in public/art, so the static
// splash in index.html and these components show the same drawings without
// copying them. Everything here is hidden from screen readers.

export type PieceKind = "white" | "king";

const PIECE_SRC: Record<PieceKind, string> = {
  white: "/art/piece-white.svg",
  king: "/art/piece-king.svg",
};

/** A glossy checkers piece seen at an angle: a cream piece or a gold rimmed king. */
export function PieceArt({ kind, className = "" }: { kind: PieceKind; className?: string }) {
  return <img className={`piece-art piece-art-${kind} ${className}`.trim()} src={PIECE_SRC[kind]} alt="" />;
}

/**
 * A checkerboard in perspective along the bottom edge, fading upwards, with
 * a blurred cream piece and king at the corners. Its styles are in
 * index.html (next to the splash's), so the static splash can use them.
 */
export function Scenery({ className = "" }: { className?: string }) {
  return (
    <div className={`scenery ${className}`.trim()} aria-hidden="true">
      <div className="scenery-board" />
      <PieceArt kind="white" className="scenery-piece scenery-piece-white" />
      <PieceArt kind="king" className="scenery-piece scenery-piece-king" />
    </div>
  );
}

// The ribbon's colour per result (owner's choice, D51): red when the AI wins,
// green when you win, dark with gold text or ivory with dark text when
// Black or White wins a two player game.
export type RibbonTone = "ai" | "you" | "black" | "white" | "draw";

/**
 * A ribbon banner: a slightly arched band with folded tails on both sides.
 * The title is real text laid over it by the caller; this is only the shape,
 * coloured by CSS (.ribbon-tone-*).
 */
export function Ribbon({ tone }: { tone: RibbonTone }) {
  return (
    <svg className={`ribbon ribbon-tone-${tone}`} viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
      {/* The tails, behind the band, each with a notch. */}
      <path className="ribbon-tail" d="M4 46H70V104H4L26 75Z" />
      <path className="ribbon-tail" d="M396 46H330V104H396L374 75Z" />
      {/* The folds where the band meets the tails. */}
      <path className="ribbon-fold" d="M44 88L70 104V88Z" />
      <path className="ribbon-fold" d="M356 88L330 104V88Z" />
      {/* The band, arched a little, with a gold edge. */}
      <path className="ribbon-band" d="M44 26Q200 6 356 26V88Q200 70 44 88Z" />
      <path className="ribbon-shine" d="M54 34Q200 16 346 34" />
    </svg>
  );
}
