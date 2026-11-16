import { memo } from "react";
import type { Player } from "../engine";
import { percentages } from "../ai/winChance";

interface WinChanceBarProps {
  chance: number; // Black's chance, 0 to 1
  black: string; // "You", "AI" or "Black"
  white: string; // "You", "AI" or "White"
  // The colour at the bottom of the board (D81: yours against the AI). Its
  // part comes first, so it sits at the bottom of the bar like its pieces.
  bottom?: Player;
}

// Each side's chance of winning (D65), like chess.com's evaluation bar: a
// bar beside the board on wide screens (the top side's part at the top, as
// on the board) and across the screen above your card on phones. One
// element; the CSS turns it. The numbers are in the label for screen
// readers, which are not told every change (it moves with each move).
export const WinChanceBar = memo(function WinChanceBar({ chance, black, white, bottom = "black" }: WinChanceBarProps) {
  const [blackPercent, whitePercent] = percentages(chance);
  const sides = [
    { player: "black" as const, name: black, percent: blackPercent },
    { player: "white" as const, name: white, percent: whitePercent },
  ];
  const [first, second] = bottom === "black" ? sides : [sides[1]!, sides[0]!];
  return (
    <div className="winbar" role="img" aria-label={`Chance to win: ${first!.name} ${first!.percent}%, ${second!.name} ${second!.percent}%`}>
      <span className={`winbar-label winbar-label-${first!.player}`} aria-hidden="true">
        <span className="winbar-name">{first!.name}</span> <span className="winbar-number">{first!.percent}%</span>
      </span>
      <span className="winbar-track" aria-hidden="true">
        <span className={`winbar-part winbar-${first!.player}`} style={{ flexBasis: `${first!.percent}%` }} />
        <span className={`winbar-part winbar-${second!.player}`} style={{ flexBasis: `${second!.percent}%` }} />
      </span>
      <span className={`winbar-label winbar-label-${second!.player}`} aria-hidden="true">
        <span className="winbar-number">{second!.percent}%</span> <span className="winbar-name">{second!.name}</span>
      </span>
    </div>
  );
});
