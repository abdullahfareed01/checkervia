// D111: the overview's other pictures from the owner's mockup: a donut of
// results, columns for the days of a week, split bars by level and a small
// line for registrations. Each picture is hidden from screen readers and
// paired with a table or text that holds the same numbers.
import { useId, useLayoutEffect, useRef } from "react";
import { chartArea, chartPath, chartTicks, shownDates } from "./Chart";
import { useDataSizes } from "./frame";
import { Icon } from "./icons";
import type { IconName } from "./icons";

const number = (value: number) => value.toLocaleString("en-GB");
export const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round(part * 100 / whole) : 0);

export interface DonutPart { readonly label: string; readonly value: number; readonly tone: "green" | "blue" | "gold" }
const RADIUS = 46, AROUND = 2 * Math.PI * RADIUS;

/** Parts run clockwise from the top: [offset, length] along the ring. */
export function donutArcs(values: readonly number[]): [number, number][] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  let start = 0;
  return values.map((value) => {
    const length = total > 0 ? Math.max(0, value) / total * AROUND : 0;
    const arc: [number, number] = [start, length];
    start += length;
    return arc;
  });
}

export function Donut({ parts, unit }: { parts: readonly DonutPart[]; unit: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const arcs = donutArcs(parts.map((part) => part.value));
  return <div className="adm-donut-row">
    <div className="adm-donut">
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle className="adm-donut-track" cx="60" cy="60" r={RADIUS} />
        {parts.map((part, index) => arcs[index]![1] > 0 && <circle key={part.label} className={`adm-donut-part adm-tone-${part.tone}`} cx="60" cy="60" r={RADIUS}
          strokeDasharray={`${arcs[index]![1].toFixed(2)} ${(AROUND - arcs[index]![1]).toFixed(2)}`} strokeDashoffset={(-arcs[index]![0]).toFixed(2)} transform="rotate(-90 60 60)" />)}
      </svg>
      <p className="adm-donut-centre"><strong className="adm-num">{number(total)}</strong><span>{unit}</span></p>
    </div>
    <ul className="adm-donut-legend">{parts.map((part) => <li key={part.label}>
      <span className={`adm-dot adm-tone-${part.tone}`} aria-hidden="true" /><span className="adm-donut-label">{part.label}</span>
      <strong className="adm-num">{percentOf(part.value, total)}%</strong><span className="adm-num adm-donut-count">{number(part.value)}</span>
    </li>)}</ul>
  </div>;
}

/** Columns with round number ticks, such as active players on each day of a week. */
export function Columns({ labels, values, caption }: { labels: readonly string[]; values: readonly number[]; caption: string }) {
  const root = useRef<HTMLDivElement>(null);
  const axis = useRef<HTMLDivElement>(null);
  useDataSizes(root);
  // D113: a day name that would touch its neighbour is hidden (a narrow
  // panel or a large text size), never clipped; the table holds them all.
  useLayoutEffect(() => {
    const row = axis.current;
    if (!row) return;
    const place = () => {
      const slots = [...row.children] as HTMLElement[];
      const spans = slots.map((slot): [number, number] => { const text = slot.firstElementChild as HTMLElement, centre = slot.offsetLeft + slot.offsetWidth / 2; return [centre - text.offsetWidth / 2, centre + text.offsetWidth / 2]; });
      shownDates(spans, 6).forEach((on, index) => { slots[index]!.style.visibility = on ? "" : "hidden"; });
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(place);
    observer.observe(row);
    return () => observer.disconnect();
  }, [labels.join()]);
  const { top, ticks } = chartTicks(Math.max(0, ...values));
  return <div ref={root} className="adm-columns">
    <div className="adm-columns-y adm-num" aria-hidden="true">{[...ticks].reverse().map((tick) => <span key={tick}>{number(tick)}</span>)}</div>
    <div className="adm-columns-plot" aria-hidden="true">
      <div className="adm-columns-grid">{ticks.map((tick) => <span key={tick} />)}</div>
      {values.map((value, index) => <div key={labels[index]} className="adm-column-slot"><div className="adm-column" data-h={(Math.max(0, value) * 100 / top).toFixed(2)} title={`${labels[index]}: ${number(value)}`} /></div>)}
    </div>
    <div ref={axis} className="adm-columns-x" aria-hidden="true">{labels.map((label) => <span key={label}><span>{label}</span></span>)}</div>
    <table className="adm-sr"><caption>{caption}</caption><tbody>{labels.map((label, index) => <tr key={label}><th scope="row">{label}</th><td>{number(values[index] ?? 0)}</td></tr>)}</tbody></table>
  </div>;
}

export interface SplitRow { readonly label: string; readonly icon: IconName; readonly left: number; readonly right: number; readonly note?: string }
/** One bar per row, split between two shares (wins and losses). */
export function SplitBars({ rows, leftLabel, rightLabel }: { rows: readonly SplitRow[]; leftLabel: string; rightLabel: string }) {
  const root = useRef<HTMLUListElement>(null);
  useDataSizes(root);
  return <ul ref={root} className="adm-split">{rows.map((row) => {
    const total = row.left + row.right, left = percentOf(row.left, total);
    return <li key={row.label}>
      <span className="adm-split-name"><Icon name={row.icon} className="adm-split-icon" />{row.label}</span>
      <span className={`adm-split-bar${total ? "" : " adm-split-empty"}`} aria-hidden="true">{total > 0 && <span className="adm-split-left" data-w={left} />}</span>
      <span className="adm-split-share adm-num">{total ? <>{left}% <span className="adm-split-sep" aria-hidden="true">|</span> {100 - left}%</> : "No games"}
        <span className="adm-sr">{total ? `: ${leftLabel} ${number(row.left)}, ${rightLabel} ${number(row.right)}${row.note ? `, ${row.note}` : ""}` : ""}</span></span>
    </li>;
  })}</ul>;
}

/** A small filled line with no axes; the number beside it says what it shows. */
export function Sparkline({ values }: { values: readonly number[] }) {
  const fade = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-spark`;
  const maximum = Math.max(1, ...values) * 1.08;
  const shown = values.length === 1 ? [values[0]!, values[0]!] : values;
  return <svg className="adm-spark" viewBox="0 0 500 160" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id={fade} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity="0.45" /><stop offset="100%" stopColor="currentColor" stopOpacity="0.04" /></linearGradient></defs>
    <path className="adm-chart-area" d={chartArea(shown, maximum)} fill={`url(#${fade})`} />
    <path className="adm-chart-line" d={chartPath(shown, maximum)} />
  </svg>;
}
