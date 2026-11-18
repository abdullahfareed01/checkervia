// SVG keeps the chart dependency-free and compatible with the admin CSP.
// HTML tooltips stay readable at narrow widths; tables expose every value.
import { useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

export interface ChartSeries { readonly label: string; readonly values: readonly number[] }
const valueAt = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value!) : 0;
export function chartX(index: number, count: number): number { return count < 2 ? 250 : 36 + index * 428 / (count - 1); }
export function nearestChartIndex(x: number, count: number): number | null {
  if (count === 0 || !Number.isFinite(x)) return null;
  return Math.max(0, Math.min(count - 1, Math.round((x - 36) / 428 * (count - 1))));
}
export function chartPath(values: readonly number[], maximum: number): string {
  const top = Math.max(1, Number.isFinite(maximum) ? maximum : 1);
  return values.map((value, index) => `${index === 0 ? "M" : "L"}${chartX(index, values.length).toFixed(1)},${(146 - Math.min(top, valueAt(value)) * 128 / top).toFixed(1)}`).join(" ");
}
export function chartArea(values: readonly number[], maximum: number): string {
  return values.length ? `${chartPath(values, maximum)} L${chartX(values.length - 1, values.length).toFixed(1)},146 L${chartX(0, values.length).toFixed(1)},146 Z` : "";
}
const number = (value: number) => value.toLocaleString("en-GB");
export function Chart({ title, labels, series, note }: {
  title: string; labels: readonly string[]; series: readonly ChartSeries[]; note?: string;
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<{ label: string; index: number } | null>(null);
  // A refreshed or resized data window cannot keep an old index selected.
  const active = hovered && labels[hovered.index] === hovered.label ? hovered.index : null;
  const maximum = Math.max(1, ...series.flatMap((entry) => entry.values.map(valueAt)));
  const gradient = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const select = (index: number | null) => setHovered(index === null ? null : { index, label: labels[index]! });
  function point(event: PointerEvent<SVGSVGElement>) {
    const rect = svg.current?.getBoundingClientRect();
    if (rect && rect.width > 0) select(nearestChartIndex((event.clientX - rect.left) * 500 / rect.width, labels.length));
  }
  function key(event: KeyboardEvent<SVGSVGElement>) {
    const current = active ?? labels.length - 1;
    const next = event.key === "ArrowLeft" ? Math.max(0, current - 1) : event.key === "ArrowRight" ? Math.min(labels.length - 1, current + 1)
      : event.key === "Home" ? 0 : event.key === "End" ? labels.length - 1 : null;
    if (event.key === "Escape") { event.preventDefault(); select(null); }
    else if (next !== null) { event.preventDefault(); select(next); }
  }
  return <section className="adm-panel adm-chart" aria-labelledby={id}>
    <div className="adm-chart-heading"><h2 id={id} className="adm-panel-title">{title}</h2><span className="adm-chart-unit">UTC</span></div>
    {note && <p className="adm-dim adm-small">{note}</p>}
    {labels.length === 0 ? <p className="adm-dim">No daily records in this period.</p> : <>
      <ul className="adm-chart-legend">{series.map((entry, index) => <li key={entry.label} className={`adm-series-${index}`}><span className="adm-chart-swatch" aria-hidden="true" /> {entry.label}</li>)}</ul>
      <div className="adm-chart-plot">
        <svg ref={svg} className="adm-chart-svg" viewBox="0 0 500 160" preserveAspectRatio="none" role="group" tabIndex={0}
          aria-roledescription="interactive chart" aria-label={`${title}. Use arrow keys to inspect dates, Home or End to jump, Escape to dismiss. Exact values are also available in Show data.`}
          aria-describedby={active === null ? undefined : `${id}-tooltip`} onPointerMove={point} onPointerDown={point}
          onPointerLeave={(event) => { if (event.pointerType !== "touch") select(null); }}
          onFocus={() => select(labels.length - 1)} onBlur={() => select(null)} onKeyDown={key}>
          <defs>{series.map((entry, index) => <linearGradient key={entry.label} id={`${gradient}-fade-${index}`} className={`adm-series-${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>)}</defs>
          <path className="adm-chart-grid" d="M36 18H464 M36 50H464 M36 82H464 M36 114H464 M36 146H464" />
          {series.map((entry, index) => <g key={entry.label} className={`adm-series-${index}`}>
            <path className="adm-chart-area" d={chartArea(entry.values, maximum)} fill={`url(#${gradient}-fade-${index})`} />
            <path className="adm-chart-line" d={chartPath(entry.values, maximum)} />
            {labels.length === 1 && <circle cx="250" cy={146 - valueAt(entry.values[0]) * 128 / maximum} r="3" />}
            {active !== null && <path className="adm-chart-point" d={`M${chartX(active, labels.length)},${146 - valueAt(entry.values[active]) * 128 / maximum}h0.01`} />}
          </g>)}
          {active !== null && <path className="adm-chart-crosshair" d={`M${chartX(active, labels.length)} 12V150`} />}
        </svg>
        {active !== null && <div id={`${id}-tooltip`} role="tooltip" className={`adm-chart-tooltip ${active < labels.length / 2 ? "adm-tip-right" : "adm-tip-left"}`}>
          <div className="adm-tooltip-heading"><strong>{labels[active]}</strong><span className="adm-tooltip-zone">UTC</span></div>
          <dl>{series.map((entry, index) => <div key={entry.label}><dt className={`adm-series-${index}`}>{entry.label}</dt><dd>{number(valueAt(entry.values[active]))}</dd></div>)}</dl>
        </div>}
      </div>
      <div className="adm-chart-axis" aria-hidden="true"><span>{labels[0]}</span><span>Scale: 0 to {number(maximum)}</span><span>{labels.at(-1)}</span></div>
      <details className="adm-chart-data"><summary>Show data for {title.toLowerCase()}</summary>
        <table className="adm-data-table"><caption>{title}, UTC dates</caption><thead><tr><th scope="col">Date</th>{series.map((entry) => <th scope="col" key={entry.label}>{entry.label}</th>)}</tr></thead>
          <tbody>{labels.map((label, index) => <tr key={label}><th scope="row">{label}</th>{series.map((entry) => <td key={entry.label}>{number(valueAt(entry.values[index]))}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </>}
  </section>;
}
