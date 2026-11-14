// The leaderboard's own icons (D62), drawn for this project after the owner's
// mockups (mockup/Leader_board.png, 2nd_ranked.png, 3rd_ranked.png): metal
// shaded crowns, trophies, laurels and the stat card symbols. The metals are
// gradients defined once per screen by <LbGradients />; an icon picks one
// with `tone`. All decorative (aria-hidden): the words next to them say it.
export type Tone = "gold" | "silver" | "bronze" | "red" | "green" | "cream" | "violet";

const fill = (tone: Tone) => `url(#lb-${tone})`;

const STOPS: Record<Tone, [string, string, string]> = {
  gold: ["#fff0a8", "#f6c445", "#c47f17"],
  silver: ["#ffffff", "#d3d9e1", "#8792a2"],
  bronze: ["#ffd2ab", "#e48b4f", "#9c4c22"],
  red: ["#ff9a8a", "#e0392e", "#8f1a14"],
  green: ["#d8f59a", "#79c23a", "#3d7a1a"],
  cream: ["#fff8ea", "#efdcbc", "#bfa27a"],
  violet: ["#e7d0ff", "#a57ee0", "#5c3a99"],
};

/** The metal gradients the icons use. Rendered once in each screen, out of sight. */
export function LbGradients() {
  return (
    <svg className="lb-gradients" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {(Object.keys(STOPS) as Tone[]).map((tone) => (
          <linearGradient key={tone} id={`lb-${tone}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={STOPS[tone][0]} />
            <stop offset="0.5" stopColor={STOPS[tone][1]} />
            <stop offset="1" stopColor={STOPS[tone][2]} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

/** A crown with three jewels; the big one sits over the top ranked player card. */
export function LbCrown({ tone = "gold", jewel = "#d3263a" }: { tone?: Tone; jewel?: string }) {
  return (
    <svg className="lb-svg lb-crown-svg" viewBox="0 0 64 44" aria-hidden="true">
      <path d="M6 14l12 12 14-20 14 20 12-12-4 24H10z" fill={fill(tone)} stroke="rgba(80,40,0,0.45)" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="9" y="36" width="46" height="6" rx="2.5" fill={fill(tone)} stroke="rgba(80,40,0,0.45)" strokeWidth="1.2" />
      <circle cx="6" cy="13" r="3.4" fill={fill(tone)} />
      <circle cx="32" cy="5" r="3.6" fill={fill(tone)} />
      <circle cx="58" cy="13" r="3.4" fill={fill(tone)} />
      <path d="M32 18l5 7-5 7-5-7z" fill={jewel} />
      <circle cx="19" cy="31" r="2.4" fill={jewel} />
      <circle cx="45" cy="31" r="2.4" fill={jewel} />
    </svg>
  );
}

/** A laurel branch; `flip` mirrors it for the right side. */
export function LbLaurel({ tone = "gold", flip = false }: { tone?: Tone; flip?: boolean }) {
  const leaves = [
    { cx: 9.5, cy: 29, r: -42 },
    { cx: 7.2, cy: 23, r: -22 },
    { cx: 6.8, cy: 16.5, r: -2 },
    { cx: 8.2, cy: 10, r: 18 },
    { cx: 16, cy: 26, r: 38 },
    { cx: 13.4, cy: 19.5, r: 32 },
    { cx: 12.6, cy: 13, r: 26 },
    { cx: 12.5, cy: 6.5, r: 18 },
  ];
  return (
    <svg className={`lb-svg lb-laurel-svg${flip ? " lb-flip" : ""}`} viewBox="0 0 24 36" aria-hidden="true">
      <path d="M17 34C9 28 7 18 10.5 4" fill="none" stroke={fill(tone)} strokeWidth="1.8" strokeLinecap="round" />
      {leaves.map(({ cx, cy, r }) => (
        <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="2.2" ry="4.3" transform={`rotate(${r} ${cx} ${cy})`} fill={fill(tone)} />
      ))}
    </svg>
  );
}

export function LbTrophy({ tone = "gold" }: { tone?: Tone }) {
  return (
    <svg className="lb-svg" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 9H8c0 11 5 17 13 18M46 9h10c0 11-5 17-13 18" fill="none" stroke={fill(tone)} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M17 6h30v16c0 10-7 17-15 17s-15-7-15-17z" fill={fill(tone)} />
      <path d="M24 11v9c0 5 3 9 6 11" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="28" y="38" width="8" height="9" fill={fill(tone)} />
      <rect x="19" y="47" width="26" height="6" rx="2" fill={fill(tone)} />
      <rect x="15" y="53" width="34" height="6" rx="2" fill={fill(tone)} />
    </svg>
  );
}

export function LbGamepad({ tone = "gold" }: { tone?: Tone }) {
  return (
    <svg className="lb-svg" viewBox="0 0 64 44" aria-hidden="true">
      <path d="M18 4h28c9 0 14 8 16 20 2 11-2 18-8 18-5 0-8-6-12-9H22c-4 3-7 9-12 9-6 0-10-7-8-18C4 12 9 4 18 4z" fill={fill(tone)} />
      <path d="M17 15v12M11 21h12" stroke="#3b2414" strokeWidth="4" strokeLinecap="round" />
      <circle cx="44" cy="17" r="3.2" fill="#3b2414" />
      <circle cx="51" cy="24" r="3.2" fill="#3b2414" />
    </svg>
  );
}

export function LbSwords({ tone = "gold" }: { tone?: Tone }) {
  return (
    <svg className="lb-svg" viewBox="0 0 48 48" aria-hidden="true">
      <g stroke={fill(tone)} strokeLinecap="round">
        <path d="M7 7l23 23M41 7L18 30" strokeWidth="5" />
        <path d="M27 35l9-9M21 35l-9-9" strokeWidth="5" />
        <path d="M34 34l7 7M14 34l-7 7" strokeWidth="5.5" />
      </g>
    </svg>
  );
}

export function LbTarget({ tone = "gold" }: { tone?: Tone }) {
  return (
    <svg className="lb-svg" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="22" cy="26" r="18" fill="none" stroke={fill(tone)} strokeWidth="5" />
      <circle cx="22" cy="26" r="9" fill="none" stroke={fill(tone)} strokeWidth="5" />
      <circle cx="22" cy="26" r="3" fill={fill(tone)} />
      <path d="M22 26L40 8M34 6h7v7" fill="none" stroke={fill(tone)} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LbStar({ tone = "gold" }: { tone?: Tone }) {
  return (
    <svg className="lb-svg" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3l6.2 13.3 14.6 1.6-10.9 9.9 3 14.3L24 34.8 11.1 42.1l3-14.3L3.2 17.9l14.6-1.6z" fill={fill(tone)} stroke="rgba(80,40,0,0.35)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Rising bars: the Medium tab and the weekly rank card. */
export function LbBars({ tone = "gold", rank = false }: { tone?: Tone; rank?: boolean }) {
  return rank ? (
    <svg className="lb-svg" viewBox="0 0 56 44" aria-hidden="true">
      <rect x="6" y="20" width="9" height="18" rx="1.5" fill={fill(tone)} />
      <rect x="18" y="4" width="9" height="34" rx="1.5" fill={fill(tone)} />
      <rect x="30" y="12" width="9" height="26" rx="1.5" fill={fill(tone)} />
      <rect x="42" y="24" width="9" height="14" rx="1.5" fill={fill(tone)} />
      <rect x="2" y="38" width="52" height="5" rx="2" fill={fill(tone)} />
    </svg>
  ) : (
    <svg className="lb-svg" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="30" width="9" height="12" rx="2" fill={fill(tone)} />
      <rect x="19.5" y="20" width="9" height="22" rx="2" fill={fill(tone)} />
      <rect x="33" y="8" width="9" height="34" rx="2" fill={fill(tone)} />
    </svg>
  );
}

export function LbCalendar({ tone = "gold" }: { tone?: Tone }) {
  return (
    <svg className="lb-svg" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="9" width="36" height="33" rx="5" fill="none" stroke={fill(tone)} strokeWidth="4" />
      <path d="M6 19h36M16 5v8M32 5v8" stroke={fill(tone)} strokeWidth="4" strokeLinecap="round" />
      <g fill={fill(tone)}>
        <rect x="13" y="25" width="5" height="4" rx="1" />
        <rect x="21.5" y="25" width="5" height="4" rx="1" />
        <rect x="30" y="25" width="5" height="4" rx="1" />
        <rect x="13" y="33" width="5" height="4" rx="1" />
        <rect x="21.5" y="33" width="5" height="4" rx="1" />
      </g>
    </svg>
  );
}

export function LbInfinity({ tone = "gold" }: { tone?: Tone }) {
  return (
    <svg className="lb-svg" viewBox="0 0 48 28" aria-hidden="true">
      <path d="M24 14c-5-6-8-9-13-9a9 9 0 0 0 0 18c5 0 8-3 13-9s8-9 13-9a9 9 0 0 1 0 18c-5 0-8-3-13-9z" fill="none" stroke={fill(tone)} strokeWidth="4.2" />
    </svg>
  );
}

/** Two snowy peaks, faint, on the weekly rank card. */
export function LbMountains() {
  return (
    <svg className="lb-svg lb-mountains" viewBox="0 0 120 40" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
      <path d="M0 40l30-22 12 8 24-22 26 24 10-6 18 18z" fill="currentColor" opacity="0.4" />
      <path d="M66 4l-8 7 5 1 3 4 4-5 4 1z" fill="#fff" opacity="0.35" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg className="lb-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function PersonIcon({ tone = "gold" }: { tone?: Tone }) {
  return (
    <svg className="lb-svg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="7.5" r="4.5" fill={fill(tone)} />
      <path d="M3.5 21c0-5 3.8-8 8.5-8s8.5 3 8.5 8z" fill={fill(tone)} />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg className="lb-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12z" fill="currentColor" />
      <circle cx="12" cy="10" r="2.6" fill="#2a170b" />
    </svg>
  );
}

export function PictureIcon() {
  return (
    <svg className="lb-svg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="8.5" cy="9.5" r="1.8" fill="currentColor" />
      <path d="M4 18l5.5-5.5 3.5 3.5 2.5-2.5L20 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg className="lb-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 19z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M13.5 7l3.5 3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** The "i" in a circle: opens the rules that apply here. */
export function InfoIcon() {
  return (
    <svg className="lb-svg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 10.5v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="7.3" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg className="lb-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The crown chips in the "Wins and losses by level" table, one colour per level.
export const LEVEL_TONES: Record<1 | 2 | 3 | 4, Tone> = { 4: "red", 3: "gold", 2: "silver", 1: "green" };

// The crown on each chip: gold on red and green, white on gold and silver.
const CHIP_CROWN: Record<1 | 2 | 3 | 4, string> = { 4: "url(#lb-gold)", 3: "#fff6d8", 2: "#ffffff", 1: "url(#lb-gold)" };

export function LevelCrown({ level }: { level: 1 | 2 | 3 | 4 }) {
  return (
    <span className={`lb-level-chip lb-level-chip-${LEVEL_TONES[level]}`} aria-hidden="true">
      <svg className="lb-svg" viewBox="0 0 24 24">
        <path d="M3 18l1.5-10 5 4.5L12 5l2.5 7.5 5-4.5L21 18z" fill={CHIP_CROWN[level]} stroke="rgba(60,30,0,0.45)" strokeWidth="0.8" strokeLinejoin="round" />
        <rect x="3" y="19" width="18" height="2.4" rx="1" fill={CHIP_CROWN[level]} />
        <circle cx="12" cy="13.5" r="1.4" fill="#d3263a" />
      </svg>
    </span>
  );
}
