// D113: the dashboard's shared building blocks. Every page is made of these,
// so sizes, spacing and contrast are the same everywhere and a new page
// inherits them: a section card, a stat tile and a hero tile for key
// numbers, a data table, a badge, an empty state, a flag with its country
// name and a relative time. The type scale and their styles are in
// styles/components.css.
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ReactNode } from "react";
import { COUNTRY_NAMES } from "../../leaderboard/countries";
import { flagUrl } from "../../ui/leaderboard/flags";
import { useDataSizes } from "./frame";
import { ago, dateTime } from "./format";
import { Icon } from "./icons";
import type { IconName } from "./icons";

export const number = (value: number) => value.toLocaleString("en-GB");
export const countryName = (country: string | null) => country ? COUNTRY_NAMES[country] ?? country : "No flag";

/** A titled panel: an icon and title, optional controls on the right, an optional note. */
export function SectionCard({ title, icon, iconTone, level = 2, note, extra, flush = false, className = "", children }: {
  title: string; icon?: IconName; iconTone?: "gold"; level?: 2 | 3; note?: ReactNode; extra?: ReactNode; flush?: boolean; className?: string; children?: ReactNode;
}) {
  const id = useId();
  const Heading = level === 3 ? "h3" : "h2";
  return <section className={`adm-panel adm-card${flush ? " adm-card-flush" : ""}${className ? ` ${className}` : ""}`} aria-labelledby={id}>
    <div className="adm-card-head">
      <Heading id={id} className="adm-panel-title">{icon && <Icon name={icon} className={iconTone ? `adm-icon-${iconTone}` : undefined} />}<span>{title}</span></Heading>
      {extra}
    </div>
    {note && <p className="adm-card-note">{note}</p>}
    {children}
  </section>;
}

export type Tone = "green" | "gold" | "red";
/** One key number with its label; it sits in a `<dl>` (TileGrid). */
export function StatTile({ icon, label, value, tone = "green", className = "", children }: {
  icon?: IconName; label: string; value: number; tone?: Tone; className?: string; children?: ReactNode;
}) {
  return <div className={`adm-stat adm-stat-${tone}${className ? ` ${className}` : ""}`}>
    <dt className="adm-stat-label">{icon && <Icon name={icon} className="adm-stat-icon" />}<span>{label}</span></dt>
    <dd><span className="adm-stat-value adm-num">{number(value)}</span>{children}</dd>
  </div>;
}

export function TileGrid({ className, children }: { className: string; children: ReactNode }) {
  return <dl className={className}>{children}</dl>;
}

/** The one number a page is about, large, with a line under it and room on the right. */
export function HeroTile({ icon, label, value, note, aside }: { icon: IconName; label: string; value: number; note: ReactNode; aside?: ReactNode }) {
  const id = useId();
  return <section className="adm-hero" aria-labelledby={id}>
    <div className="adm-hero-main">
      <h2 id={id} className="adm-hero-label"><Icon name={icon} /><span>{label}</span></h2>
      <p className="adm-hero-value adm-num">{number(value)}</p>
      <p className="adm-hero-note">{note}</p>
    </div>
    {aside && <div className="adm-hero-aside">{aside}</div>}
  </section>;
}

/** Parts of a whole: a thin bar of shares (a picture only) and the labelled numbers. */
export function Breakdown({ label, parts }: { label: string; parts: readonly { label: string; value: number }[] }) {
  const root = useRef<HTMLDivElement>(null);
  useDataSizes(root);
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  return <div ref={root} className="adm-breakdown">
    <span className={`adm-breakdown-bar${total ? "" : " adm-breakdown-empty"}`} aria-hidden="true">
      {total > 0 && parts.map((part, index) => part.value > 0 && <span key={part.label} className={`adm-breakdown-part adm-level-${index + 1}`} data-w={(part.value * 100 / total).toFixed(2)} />)}
    </span>
    <ul className="adm-breakdown-list" aria-label={label}>{parts.map((part, index) => <li key={part.label}>
      <span className={`adm-dot adm-level-${index + 1}`} aria-hidden="true" /><span className="adm-breakdown-name">{part.label}</span><strong className="adm-num">{number(part.value)}</strong>
    </li>)}</ul>
  </div>;
}

export type BadgeTone = "neutral" | "ok" | "warn" | "danger";
/** A short status in words; the colour only repeats what the words say. */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`adm-badge adm-badge-${tone}`}>{children}</span>;
}
const TONES: Readonly<Record<string, BadgeTone>> = {
  active: "ok", done: "ok", ok: "ok", reviewed: "ok", actioned: "ok",
  suspended: "warn", hidden: "neutral", dismissed: "neutral",
  banned: "danger", "device banned": "danger", open: "danger", refused: "danger", failed: "danger",
};
export const toneOf = (status: string): BadgeTone => TONES[status.toLowerCase()] ?? "neutral";

/** What an empty list will show once there is something to show. */
export function EmptyState({ title, text, icon = "info" }: { title: string; text: string; icon?: IconName }) {
  return <div className="adm-empty-state">
    <Icon name={icon} className="adm-empty-icon" />
    <p className="adm-empty-title">{title}</p>
    <p className="adm-empty-text">{text}</p>
  </div>;
}

/** The chosen flag (flag-icons, the game's own files) and the country's name. */
export function FlagName({ code }: { code: string | null }) {
  const url = flagUrl(code);
  const [broken, setBroken] = useState<string | null>(null);
  return <span className="adm-flag-name">
    {url && broken !== url ? <img className="adm-flag" src={url} alt="" width={20} height={15} loading="lazy" decoding="async" onError={() => setBroken(url)} />
      : <span className="adm-flag adm-flag-none" aria-hidden="true" />}
    <span>{countryName(code)}</span>
  </span>;
}

/** A recent time in words; the exact date and time on hover and for machines. */
export function When({ iso, now }: { iso: string; now?: number }) {
  return <time className="adm-when adm-num" dateTime={iso} title={dateTime(iso)}>{ago(iso, now)}</time>;
}

export interface Column<T> {
  readonly label: string;
  readonly cell: (row: T) => ReactNode;
  /** Numbers: right aligned, digits in even columns. */
  readonly numeric?: boolean;
  /** The cell that names the row (a row header). */
  readonly head?: boolean;
  /** Buttons for the row; the header is for screen readers only. */
  readonly actions?: boolean;
  /** On a phone, where rows become cards: two columns wide, or the full width. */
  readonly span?: "half" | "all";
  readonly title?: (row: T) => string | undefined;
}

/**
 * When a table does not fit its box: on a narrow box (under 56em, which a
 * large text size also makes) each row becomes a small card with labelled
 * cells; on a wide one the table scrolls sideways with its first column
 * pinned. Measured in the browser, so the text size and the real names
 * decide, not a fixed screen width.
 */
function useStacking(box: RefObject<HTMLDivElement | null>, rows: number) {
  useLayoutEffect(() => {
    const wrap = box.current, table = wrap?.querySelector("table");
    if (!wrap || !table) return;
    const measure = () => {
      table.classList.remove("adm-stacked");
      const em = parseFloat(getComputedStyle(wrap).fontSize) || 16;
      const stacked = table.scrollWidth > wrap.clientWidth + 1 && wrap.clientWidth < 56 * em;
      table.classList.toggle("adm-stacked", stacked);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); });
    observer.observe(wrap);
    observer.observe(table);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [box, rows]);
}

/**
 * A data table: a clear header that stays in view while the table scrolls,
 * rows of at least 44px, numbers right aligned, a hover line, and an empty
 * state that says what will appear. Where it does not fit, its rows become
 * small cards, each cell with its own label (useStacking).
 */
export function DataTable<T>({ label, columns, rows, rowKey, empty }: {
  label: string; columns: readonly Column<T>[]; rows: readonly T[]; rowKey: (row: T) => string; empty: { title: string; text: string; icon?: IconName };
}) {
  const box = useRef<HTMLDivElement>(null);
  useStacking(box, rows.length);
  if (!rows.length) return <EmptyState {...empty} />;
  const kind = (column: Column<T>) => [column.numeric ? "adm-cell-num" : "", column.actions ? "adm-cell-actions" : "", column.span === "half" ? "adm-span-2" : column.span === "all" ? "adm-span-all" : ""].filter(Boolean).join(" ") || undefined;
  return <div ref={box} className="adm-table-scroll" tabIndex={0} role="region" aria-label={label}>
    <table className="adm-data-table adm-list-table">
      <caption className="adm-sr">{label}</caption>
      <thead><tr>{columns.map((column) => <th scope="col" key={column.label} className={kind(column)}>{column.actions ? <span className="adm-sr">{column.label}</span> : column.label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => column.head
        ? <th scope="row" key={column.label} className={`adm-row-head${kind(column) ? ` ${kind(column)}` : ""}`}>{column.cell(row)}</th>
        : <td key={column.label} className={kind(column)} data-label={column.actions ? undefined : column.label} title={column.title?.(row)}>
          {column.actions ? <div className="adm-row-actions">{column.cell(row)}</div> : column.cell(row)}
        </td>)}</tr>)}</tbody>
    </table>
  </div>;
}
