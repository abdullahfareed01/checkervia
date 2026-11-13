import { memo, useEffect, useRef } from "react";
import type { HistoryTarget } from "../state/gameReducer";
import type { MoveListItem } from "../state/history";
import { moveText } from "./notation";

interface HistoryControlsProps {
  index: number; // position on screen: 0 = start, n = after move n
  total: number; // moves played
  live: boolean;
  canBack: boolean;
  canForward: boolean;
  moves: MoveListItem[];
  nameOf: (item: MoveListItem) => string; // "You", "AI", "Black", "White"
  onGo: (to: HistoryTarget) => void;
}

// One arrow button. Disabled arrows stay visible but greyed out, like chess.com.
function Arrow({ label, symbol, disabled, onClick }: { label: string; symbol: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="history-arrow" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <span aria-hidden="true">{symbol}</span>
    </button>
  );
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

// The history arrows (first, back, forward, latest), where we are, and the
// list of moves; clicking a move shows the position after it.
// Memoised: a click that only picks up a piece does not redraw the list.
export const HistoryControls = memo(function HistoryControls({ index, total, live, canBack, canForward, moves, nameOf, onGo }: HistoryControlsProps) {
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
      <div className="history-bar">
        <Arrow label="First position" symbol="⏮" disabled={!canBack} onClick={() => onGo("first")} />
        <Arrow label="Previous move" symbol="◀" disabled={!canBack} onClick={() => onGo("back")} />
        <span className="history-where" aria-live="polite">
          {where}
        </span>
        <Arrow label="Next move" symbol="▶" disabled={!canForward} onClick={() => onGo("forward")} />
        <Arrow label="Latest position" symbol="⏭" disabled={!canForward} onClick={() => onGo("last")} />
      </div>

      {!live && (
        <button type="button" className="history-return" onClick={() => onGo("last")}>
          Reviewing an earlier position. Back to the game
        </button>
      )}

      {moves.length > 0 && (
        <ol className="history-list" ref={listRef}>
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
