// D109: smooth area charts that run edge to edge and draw in from left to
// right. SVG keeps them dependency free under the admin CSP; the tooltip is
// a small HTML pill (value and date) above a dotted crosshair, centred on it
// but kept inside the plot, placed with the CSSOM (allowed by
// `style-src 'self'`, unlike style attributes in markup). Exact values stay
// available in the data table under each chart.
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

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
const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** "2026-11-09" reads as "Mon 9 Nov" (a UTC day); other labels stay as they are. */
export function dayLabel(label: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(label) ? dayFormat.format(new Date(`${label}T00:00:00Z`)).replace(",", "") : label;
}

export function Chart({ title, labels, series, note }: {
  title: string; labels: readonly string[]; series: readonly ChartSeries[]; note?: string;
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ label: string; index: number } | null>(null);
  // A refreshed or resized data window cannot keep an old index selected.
  const active = hovered && labels[hovered.index] === hovered.label ? hovered.index : null;
  const maximum = Math.max(1, ...series.flatMap((entry) => entry.values.map(valueAt)));
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
  // Centre the pill on the crosshair, then keep it inside the plot.
  useLayoutEffect(() => {
    const node = tip.current, plot = node?.parentElement;
    if (!node || !plot || active === null) return;
    const width = plot.clientWidth, own = node.offsetWidth;
    const centre = chartX(active, labels.length) / WIDTH * width;
    node.style.left = `${Math.max(0, Math.min(width - own, centre - own / 2))}px`;
  });
  return <section className="adm-panel adm-chart" aria-labelledby={id}>
    <div className="adm-chart-heading">
      <h2 id={id} className="adm-panel-title">{title}</h2>
      {series.length > 1 && <ul className="adm-chart-legend">{series.map((entry, index) => <li key={entry.label} className={`adm-series-${index}`}><span className="adm-chart-swatch" aria-hidden="true" />{entry.label}</li>)}</ul>}
    </div>
    {note && <p className="adm-dim adm-small">{note}</p>}
    {labels.length === 0 ? <p className="adm-dim">No daily records in this period.</p> : <>
      <div className="adm-chart-plot">
        <span className="adm-chart-max adm-num" aria-hidden="true">{number(maximum)}</span>
        <svg ref={svg} className="adm-chart-svg" viewBox="0 0 500 160" preserveAspectRatio="none" role="group" tabIndex={0}
          aria-roledescription="interactive chart" aria-label={`${title}. Use arrow keys to inspect dates, Home or End to jump, Escape to dismiss. Exact values are also available in Show data.`}
          aria-describedby={active === null ? undefined : `${id}-tooltip`} onPointerMove={point} onPointerDown={point}
          onPointerLeave={(event) => { if (event.pointerType !== "touch") select(null); }}
          onFocus={() => select(labels.length - 1)} onBlur={() => select(null)} onKeyDown={key}>
          <defs>{series.map((entry, index) => <linearGradient key={entry.label} id={`${gradient}-fade-${index}`} className={`adm-series-${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={index === 0 ? "0.28" : "0.12"} /><stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>)}</defs>
          <path className="adm-chart-grid" d={`M0 ${TOP}H500 M0 ${(TOP + BASE) / 2}H500 M0 ${BASE}H500`} />
          {/* Keyed by the dates, so a new period draws in again from the left. */}
          <g key={`${labels[0]}:${labels.length}`} className="adm-chart-reveal">
            {series.map((entry, index) => <g key={entry.label} className={`adm-series-${index}`}>
              <path className="adm-chart-area" d={chartArea(entry.values, maximum)} fill={`url(#${gradient}-fade-${index})`} />
              <path className="adm-chart-line" d={chartPath(entry.values, maximum)} />
            </g>)}
          </g>
          {labels.length === 1 && series.map((entry, index) => <path key={entry.label} className={`adm-chart-point adm-series-${index}`} d={`M250,${fixed(chartY(entry.values[0], maximum))}h0.01`} />)}
          {active !== null && <path className="adm-chart-crosshair" d={`M${fixed(chartX(active, labels.length))} 0V160`} />}
          {active !== null && series.map((entry, index) => <path key={entry.label} className={`adm-chart-point adm-series-${index}`} d={`M${fixed(chartX(active, labels.length))},${fixed(chartY(entry.values[active], maximum))}h0.01`} />)}
        </svg>
        {active !== null && <div ref={tip} id={`${id}-tooltip`} role="tooltip" className="adm-chart-tooltip">
          {series.map((entry, index) => <span key={entry.label} className={`adm-tip-value adm-series-${index}`}>
            {series.length > 1 && <span className="adm-tip-dot" aria-hidden="true" />}
            <strong className="adm-num">{number(valueAt(entry.values[active]))}</strong>{series.length > 1 && <span className="adm-sr"> {entry.label}</span>}
          </span>)}
          <span className="adm-tip-date">{dayLabel(labels[active]!)}</span>
        </div>}
      </div>
      <div className="adm-chart-axis" aria-hidden="true"><span>{dayLabel(labels[0]!)}</span><span>{dayLabel(labels.at(-1)!)} UTC</span></div>
      <details className="adm-chart-data"><summary>Show data<span className="adm-sr"> for {title.toLowerCase()}</span></summary>
        <div className="adm-table-scroll"><table className="adm-data-table"><caption>{title}, UTC dates</caption><thead><tr><th scope="col">Date</th>{series.map((entry) => <th scope="col" key={entry.label}>{entry.label}</th>)}</tr></thead>
          <tbody>{labels.map((label, index) => <tr key={label}><th scope="row">{label}</th>{series.map((entry) => <td key={entry.label}>{number(valueAt(entry.values[index]))}</td>)}</tr>)}</tbody>
        </table></div>
      </details>
    </>}
  </section>;
}
