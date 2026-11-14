import { memo, useEffect, useRef } from "react";
import type { HistoryTarget } from "../state/gameReducer";
import type { MoveListItem } from "../state/history";
import { moveText } from "./notation";

interface HistoryControlsProps {
  index: number; // position on screen: 0 = start, n = after move n
  total: number; // moves played
  live: boolean;
  moves: MoveListItem[];
  nameOf: (item: MoveListItem) => string; // "You", "AI", "Black", "White"
  onGo: (to: HistoryTarget) => void;
}

// Scrolls `list` (and nothing else) just enough to show `item`.
function scrollListTo(list: HTMLElement, item: HTMLElement): void {
  const top = item.offsetTop - list.offsetTop;
  const bottom = top + item.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}

interface MoveRowProps {
  item: MoveListItem;
  current: boolean;
  who: string;
  onGo: (to: HistoryTarget) => void;
}

// One move in the list. Memoised: in a long game only the new row and the
// rows whose "current" mark changed are drawn again.
const MoveRow = memo(function MoveRow({ item, current, who, onGo }: MoveRowProps) {
  return (
    <button
      type="button"
      className={`history-item history-item-${item.player}`}
      aria-current={current ? "step" : undefined}
      onClick={() => onGo(item.number)}
    >
      <span className="history-number">{item.number}.</span>
      <span className={`disc disc-${item.player}`} aria-hidden="true" />
      <span className="history-who">{who}</span>
      <span className="history-move">{moveText(item.move, item.crowned)}</span>
    </button>
  );
});

// Where we are in the game, and the list of moves: clicking a move shows the
// position after it, "Start" the position before the first move. Previous
// and Next are on the action bar (D50); Home and End work as keys.
// Memoised: a click that only picks up a piece does not redraw the list.
export const HistoryControls = memo(function HistoryControls({ index, total, live, moves, nameOf, onGo }: HistoryControlsProps) {
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the move on screen visible in the list. Only the list scrolls:
  // scrollIntoView would also scroll the page, which made the board jump on
  // phones as the list grew. Done in the next animation frame, when the
  // browser lays out the page anyway; measuring straight after a move forced
  // an extra layout in the middle of the move (DEV-010).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const current = list?.querySelector<HTMLElement>('[aria-current="step"]');
      if (list && current) scrollListTo(list, current);
    });
    return () => cancelAnimationFrame(frame);
  }, [index, total]);

  const where = total === 0 ? "No moves yet" : index === 0 ? `Start · ${total} moves` : `Move ${index} of ${total}`;

  return (
    <section className={`history${live ? "" : " history-reviewing"}`} aria-label="Move history">
      <p className="history-where" aria-live="polite">
        {where}
      </p>

      {!live && (
        <button type="button" className="history-return" onClick={() => onGo("last")}>
          Reviewing an earlier position. Back to the game
        </button>
      )}

      {moves.length > 0 && (
        <ol className="history-list" ref={listRef}>
          <li>
            <button type="button" className="history-item history-start" aria-current={index === 0 ? "step" : undefined} onClick={() => onGo("first")}>
              Start
            </button>
          </li>
          {moves.map((item) => (
            <li key={item.number}>
              <MoveRow item={item} current={item.number === index} who={nameOf(item)} onGo={onGo} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});
