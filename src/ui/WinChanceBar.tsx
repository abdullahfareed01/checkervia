import { memo } from "react";
import { percentages } from "../ai/winChance";

interface WinChanceBarProps {
  chance: number; // Black's chance, 0 to 1
  black: string; // "You" or "Black"
  white: string; // "AI" or "White"
}

// Each side's chance of winning (D65), like chess.com's evaluation bar: a
// bar beside the board on wide screens (White's part at the top, as on the
// board) and across the screen above your card on phones. One element; the
// CSS turns it. The numbers are in the label for screen readers, which are
// not told every change (it moves with each move).
export const WinChanceBar = memo(function WinChanceBar({ chance, black, white }: WinChanceBarProps) {
  const [blackPercent, whitePercent] = percentages(chance);
  return (
    <div className="winbar" role="img" aria-label={`Chance to win: ${black} ${blackPercent}%, ${white} ${whitePercent}%`}>
      <span className="winbar-label winbar-label-black" aria-hidden="true">
        <span className="winbar-name">{black}</span> <span className="winbar-number">{blackPercent}%</span>
      </span>
      <span className="winbar-track" aria-hidden="true">
        <span className="winbar-part winbar-black" style={{ flexBasis: `${blackPercent}%` }} />
        <span className="winbar-part winbar-white" style={{ flexBasis: `${whitePercent}%` }} />
      </span>
      <span className="winbar-label winbar-label-white" aria-hidden="true">
        <span className="winbar-number">{whitePercent}%</span> <span className="winbar-name">{white}</span>
      </span>
    </div>
  );
});
