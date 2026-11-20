// D109: smooth area charts that run edge to edge and draw in from left to
// right. D111 (owner mockup): round number ticks on the left, dates along
// the bottom, hollow points on a dashed crosshair and a small card with the
// date and every series. SVG keeps them dependency free under the admin CSP;
// labels and the card are HTML placed with the CSSOM (allowed by
// `style-src 'self'`, unlike style attributes in markup).
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Icon } from "./icons";
import type { IconName } from "./icons";

export interface ChartSeries { readonly label: string; readonly values: readonly number[] }

const WIDTH = 500, TOP = 8, BASE = 152; // viewBox 0 0 500 160; the line stays between TOP and BASE
const valueAt = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value!) : 0;
const fixed = (value: number) => value.toFixed(1);

export function chartX(index: number, count: number): number { return count < 2 ? WIDTH / 2 : index * WIDTH / (count - 1); }
export function chartY(value: number | undefined, maximum: number): number {
  const top = Math.max(1, Number.isFinite(maximum) ? maximum : 1);
  return BASE - Math.min(top, valueAt(value)) * (BASE - TOP) / top;
}
export function nearestChartIndex(x: number, count: number): number | null {
  if (count === 0 || !Number.isFinite(x)) return null;
  return Math.max(0, Math.min(count - 1, Math.round(x / WIDTH * (count - 1))));
}

/** Whole number ticks from zero, at most five steps of 1, 2, 2.5 or 5 times a power of ten. */
export function chartTicks(maximum: number): { readonly top: number; readonly ticks: readonly number[] } {
  const highest = Math.max(1, Number.isFinite(maximum) ? maximum : 1);
  const magnitude = 10 ** Math.floor(Math.log10(highest / 5) || 0);
  let step = 1;
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    step = Math.max(1, multiple * Math.max(1, magnitude));
    if (!Number.isInteger(step)) continue;
    if (step * 5 >= highest) break;
  }
  const top = Math.ceil(highest / step) * step;
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step) };
}

/**
 * A monotone cubic curve (Fritsch and Carlson) through every point: smooth,
 * but it never swings above or below its neighbours, so a chart of counts
 * never dips under zero or shows a peak the data does not have.
 */
export function chartPath(values: readonly number[], maximum: number): string {
  const points = values.map((value, index) => [chartX(index, values.length), chartY(value, maximum)] as const);
  if (points.length === 0) return "";
  if (points.length === 1) return `M${fixed(points[0]![0])},${fixed(points[0]![1])}`;
  const slopes = points.slice(1).map(([x, y], i) => (y - points[i]![1]) / (x - points[i]![0]));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0]!;
    if (i === points.length - 1) return slopes[i - 1]!;
    const before = slopes[i - 1]!, after = slopes[i]!;
    // Equal spacing: the harmonic mean, flat at every peak and valley.
    return before * after <= 0 ? 0 : 2 / (1 / before + 1 / after);
  });
  let path = `M${fixed(points[0]![0])},${fixed(points[0]![1])}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!, [x1, y1] = points[i]!, third = (x1 - x0) / 3;
    path += ` C${fixed(x0 + third)},${fixed(y0 + tangents[i - 1]! * third)} ${fixed(x1 - third)},${fixed(y1 - tangents[i]! * third)} ${fixed(x1)},${fixed(y1)}`;
  }
  return path;
}
export function chartArea(values: readonly number[], maximum: number): string {
  return values.length ? `${chartPath(values, maximum)} L${fixed(chartX(values.length - 1, values.length))},160 L${fixed(chartX(0, values.length))},160 Z` : "";
}

const number = (value: number) => value.toLocaleString("en-GB");
const isDay = (label: string) => /^\d{4}-\d{2}-\d{2}$/.test(label);
const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shortFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** "2026-11-09" reads as "Mon 9 Nov" (a UTC day); other labels stay as they are. */
export function dayLabel(label: string): string {
  return isDay(label) ? dayFormat.format(new Date(`${label}T00:00:00Z`)).replace(",", "") : label;
}
/** "2026-11-09" reads as "9 Nov", as on the chart's date axis. */
export function shortDay(label: string): string {
  return isDay(label) ? shortFormat.format(new Date(`${label}T00:00:00Z`)) : label;
}
/** Up to 11 dates for the axis at an even step, as in the mockup, and always the last. */
export function axisIndexes(count: number): number[] {
  if (count <= 0) return [];
  const step = Math.max(1, Math.ceil((count - 1) / 10));
  const indexes: number[] = [];
  for (let index = 0; index < count - 1; index += step) indexes.push(index);
  return [...indexes, count - 1];
}

/**
 * Which axis dates to show, given each one's [left, right] in pixels: the
 * smallest even step at which none of them come closer than `gap`. The last
 * date always shows; a date just before it that would touch it is dropped.
 */
export function shownDates(spans: readonly (readonly [number, number])[], gap: number): boolean[] {
  const count = spans.length;
  for (let step = 1; step <= Math.max(1, count); step++) {
    const shown = spans.map((_, index) => index % step === 0 || index === count - 1);
    const visible = shown.flatMap((on, index) => (on ? [index] : []));
    if (visible.length > 2) {
      const [before, last] = visible.slice(-2) as [number, number];
      if (spans[before]![1] + gap > spans[last]![0]) shown[before] = false;
    }
    const kept = shown.flatMap((on, index) => (on ? [spans[index]!] : []));
    if (kept.every((span, index) => index === 0 || kept[index - 1]![1] + gap <= span[0])) return shown;
  }
  return spans.map((_, index) => index === 0 || index === count - 1);
}

export function Chart({ title, labels, series, note, icon, data = "details" }: {
  title: string; labels: readonly string[]; series: readonly ChartSeries[]; note?: string; icon?: IconName;
  /** "details": a Show data table under the chart; "hidden": the same table for screen readers only. */
  data?: "details" | "hidden";
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const axis = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ label: string; index: number } | null>(null);
  // A refreshed or resized data window cannot keep an old index selected.
  const active = hovered && labels[hovered.index] === hovered.label ? hovered.index : null;
  const { top: maximum, ticks } = chartTicks(Math.max(0, ...series.flatMap((entry) => entry.values.map(valueAt))));
  const gradient = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const select = (index: number | null) => setHovered(index === null ? null : { index, label: labels[index]! });
  function point(event: PointerEvent<SVGSVGElement>) {
    const rect = svg.current?.getBoundingClientRect();
    if (rect && rect.width > 0) select(nearestChartIndex((event.clientX - rect.left) * WIDTH / rect.width, labels.length));
  }
  function key(event: KeyboardEvent<SVGSVGElement>) {
    const current = active ?? labels.length - 1;
    const next = event.key === "ArrowLeft" ? Math.max(0, current - 1) : event.key === "ArrowRight" ? Math.min(labels.length - 1, current + 1)
      : event.key === "Home" ? 0 : event.key === "End" ? labels.length - 1 : null;
    if (event.key === "Escape") { event.preventDefault(); select(null); }
    else if (next !== null) { event.preventDefault(); select(next); }
  }
  const dates = labels.join();
  useLayoutEffect(() => {
    // Dates sit under their points; the outer ones stay inside the panel,
    // again whenever the chart or its text changes size (zoom, text size).
    const row = axis.current;
    if (!row) return;
    const place = () => {
      const width = row.clientWidth, spare = row.parentElement?.querySelector<HTMLElement>(".adm-chart-y")?.offsetWidth ?? 0;
      const nodes = [...row.querySelectorAll<HTMLElement>("[data-at]")];
      const spans = nodes.map((node) => {
        const own = node.offsetWidth, centre = Number(node.dataset["at"]) / WIDTH * width;
        const left = Math.max(-spare, Math.min(width - own, centre - own / 2));
        node.style.left = `${left}px`;
        return [left, left + own] as const;
      });
      // Show every date, or every second, third... whichever is the first
      // step where no two touch; the last date always shows.
      nodes.forEach((node, index) => { node.style.visibility = shownDates(spans, 8)[index] ? "" : "hidden"; });
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(place);
    observer.observe(row);
    row.querySelectorAll("[data-at]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [dates]);
  const yAxis = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Ticks sit on their grid lines at any plot height (the chart fills its panel).
    yAxis.current?.querySelectorAll<HTMLElement>("[data-top]").forEach((tick) => { tick.style.top = `${tick.dataset["top"]}%`; });
    // The card sits beside the crosshair (right of it while it fits), inside the plot.
    const node = tip.current, plot = node?.parentElement;
    if (!node || !plot || active === null) return;
    const width = plot.clientWidth, own = node.offsetWidth, centre = chartX(active, labels.length) / WIDTH * width;
    const left = centre + 12 + own <= width ? centre + 12 : centre - 12 - own;
    node.style.left = `${Math.max(0, Math.min(width - own, left))}px`;
  });
  const table = <table className="adm-data-table"><caption className="adm-sr">{title}, UTC dates</caption><thead><tr><th scope="col">Date</th>{series.map((entry) => <th className="adm-cell-num" scope="col" key={entry.label}>{entry.label}</th>)}</tr></thead>
    <tbody>{labels.map((label, index) => <tr key={label}><th className="adm-row-head adm-num" scope="row">{label}</th>{series.map((entry) => <td className="adm-cell-num" key={entry.label}>{number(valueAt(entry.values[index]))}</td>)}</tr>)}</tbody>
  </table>;
  return <section className="adm-panel adm-chart" aria-labelledby={id}>
    <div className="adm-chart-heading">
      <h2 id={id} className="adm-panel-title">{icon && <Icon name={icon} />}<span>{title}</span></h2>
      {series.length > 1 && <ul className="adm-chart-legend">{series.map((entry, index) => <li key={entry.label} className={`adm-series-${index}`}><span className="adm-chart-swatch" aria-hidden="true" />{entry.label}</li>)}</ul>}
    </div>
    {note && <p className="adm-dim adm-small">{note}</p>}
    {labels.length === 0 ? <p className="adm-dim">No daily records in this period.</p> : <>
      <div className="adm-chart-body">
        <div ref={yAxis} className="adm-chart-y adm-num" aria-hidden="true">
          <span className="adm-chart-y-size">{number(maximum)}</span>
          {[...ticks].reverse().map((tick) => <span key={tick} data-top={(chartY(tick, maximum) / 160 * 100).toFixed(2)}>{number(tick)}</span>)}
        </div>
        <div className="adm-chart-plot">
          <svg ref={svg} className="adm-chart-svg" viewBox="0 0 500 160" preserveAspectRatio="none" role="group" tabIndex={0}
            aria-roledescription="interactive chart" aria-label={`${title}. Use arrow keys to inspect dates, Home or End to jump, Escape to dismiss.${data === "details" ? " Exact values are also available in Show data." : ""}`}
            aria-describedby={active === null ? undefined : `${id}-tooltip`} onPointerMove={point} onPointerDown={point}
            onPointerLeave={(event) => { if (event.pointerType !== "touch") select(null); }}
            onFocus={() => select(labels.length - 1)} onBlur={() => select(null)} onKeyDown={key}>
            <defs>{series.map((entry, index) => <linearGradient key={entry.label} id={`${gradient}-fade-${index}`} className={`adm-series-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={index === 0 ? "0.34" : "0.16"} /><stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
            </linearGradient>)}</defs>
            <path className="adm-chart-grid" d={ticks.map((tick) => `M0 ${fixed(chartY(tick, maximum))}H500`).join(" ")} />
            {/* Keyed by the dates, so a new period draws in again from the left. */}
            <g key={`${labels[0]}:${labels.length}`} className="adm-chart-reveal">
              {series.map((entry, index) => <g key={entry.label} className={`adm-series-${index}`}>
                <path className="adm-chart-area" d={chartArea(entry.values, maximum)} fill={`url(#${gradient}-fade-${index})`} />
                <path className="adm-chart-line" d={chartPath(entry.values, maximum)} />
              </g>)}
            </g>
            {labels.length === 1 && series.map((entry, index) => <path key={entry.label} className={`adm-chart-point adm-series-${index}`} d={`M250,${fixed(chartY(entry.values[0], maximum))}h0.01`} />)}
            {active !== null && <path className="adm-chart-crosshair" d={`M${fixed(chartX(active, labels.length))} 0V160`} />}
            {active !== null && series.map((entry, index) => {
              const d = `M${fixed(chartX(active, labels.length))},${fixed(chartY(entry.values[active], maximum))}h0.01`;
              return <g key={entry.label} className={`adm-series-${index}`}><path className="adm-chart-point" d={d} /><path className="adm-chart-hole" d={d} /></g>;
            })}
          </svg>
          {active !== null && <div ref={tip} id={`${id}-tooltip`} role="tooltip" className="adm-chart-tooltip">
            <strong className="adm-tip-date">{shortDay(labels[active]!)}</strong>
            {series.map((entry, index) => <span key={entry.label} className={`adm-tip-row adm-series-${index}`}>
              <span className="adm-tip-dot" aria-hidden="true" /><span className="adm-tip-label">{entry.label}</span>
              <strong className="adm-num">{number(valueAt(entry.values[active]))}</strong>
            </span>)}
          </div>}
        </div>
        <div ref={axis} className="adm-chart-x adm-num" aria-hidden="true">{axisIndexes(labels.length).map((index) => <span key={index} data-at={chartX(index, labels.length)}>{shortDay(labels[index]!)}</span>)}</div>
      </div>
      {data === "details" ? <details className="adm-chart-data"><summary>Show data<span className="adm-sr"> for {title.toLowerCase()}</span></summary>
        <div className="adm-table-scroll" tabIndex={0} role="region" aria-label={`${title}, data`}>{table}</div>
      </details> : <div className="adm-sr">{table}</div>}
    </>}
  </section>;
}
