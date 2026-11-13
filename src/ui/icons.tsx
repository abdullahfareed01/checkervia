// Inline SVG icons, drawn here so there are no image files or licences to
// manage. They use currentColor, so CSS sets their colour.

export function HumanIcon() {
  return (
    <svg className="icon icon-human" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="17" r="9" fill="currentColor" />
      <path d="M8 44c0-9 7-15 16-15s16 6 16 15z" fill="currentColor" />
    </svg>
  );
}

// A trophy for the winner popup.
export function TrophyIcon() {
  return (
    <svg className="icon icon-trophy" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16z" fill="currentColor" />
      <path d="M18 12H9c0 9 4 14 11 15M46 12h9c0 9-4 14-11 15" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="28" y="37" width="8" height="9" fill="currentColor" />
      <rect x="19" y="46" width="26" height="6" rx="2" fill="currentColor" />
      <rect x="15" y="52" width="34" height="5" rx="2" fill="currentColor" />
      <path className="trophy-shine" d="M24 13v8c0 4 2 7 5 9" fill="none" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// A small crown, shown next to the winner's name.
export function CrownIcon() {
  return (
    <svg className="icon icon-crown" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 18l1.5-10 5 4.5L12 5l2.5 7.5 5-4.5L21 18z" fill="currentColor" />
      <rect x="3" y="19" width="18" height="2.4" rx="1" fill="currentColor" />
    </svg>
  );
}

// A friendly robot head. With `thinking`, its antenna light pulses and its
// eyes scan (see .robot-thinking in styles.css).
export function RobotIcon({ thinking = false }: { thinking?: boolean }) {
  return (
    <svg
      className={`icon icon-robot${thinking ? " robot-thinking" : ""}`}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <line x1="24" y1="4" x2="24" y2="11" stroke="currentColor" strokeWidth="2.5" />
      <circle className="robot-light" cx="24" cy="5" r="3.2" />
      <rect x="9" y="11" width="30" height="24" rx="7" fill="currentColor" />
      <rect x="4" y="18" width="5" height="10" rx="2" fill="currentColor" />
      <rect x="39" y="18" width="5" height="10" rx="2" fill="currentColor" />
      <g className="robot-eyes">
        <circle className="robot-eye" cx="18" cy="22" r="3.4" />
        <circle className="robot-eye" cx="30" cy="22" r="3.4" />
      </g>
      <rect className="robot-mouth" x="17" y="28.5" width="14" height="2.6" rx="1.3" />
      <rect x="15" y="37" width="18" height="8" rx="3" fill="currentColor" />
    </svg>
  );
}

// The AI's portrait on its player card: a white robot with a dark visor and
// blue eyes. With `thinking`, the antenna light blinks and the eyes scan.
export function RobotAvatar({ thinking = false }: { thinking?: boolean }) {
  return (
    <svg className={`icon robot-avatar${thinking ? " robot-thinking" : ""}`} viewBox="0 0 48 48" aria-hidden="true">
      <line x1="24" y1="5" x2="24" y2="10" stroke="#c9d3db" strokeWidth="2" strokeLinecap="round" />
      <circle className="robot-light" cx="24" cy="4.5" r="2.6" />
      <rect x="5" y="17" width="5" height="11" rx="2.5" fill="#aeb9c3" />
      <rect x="38" y="17" width="5" height="11" rx="2.5" fill="#aeb9c3" />
      <rect x="9" y="10" width="30" height="25" rx="9" fill="#eef2f5" />
      <rect x="9" y="27" width="30" height="8" rx="4" fill="#d5dde4" />
      <rect x="13" y="15" width="22" height="13" rx="6" fill="#1b2631" />
      <g className="robot-eyes">
        <rect className="robot-eye-blue" x="17" y="19" width="5" height="5.5" rx="2.5" />
        <rect className="robot-eye-blue" x="26" y="19" width="5" height="5.5" rx="2.5" />
      </g>
      <path d="M14 46c0-6 4-10 10-10s10 4 10 10z" fill="#eef2f5" />
      <rect x="21" y="39" width="6" height="3" rx="1.5" fill="#4fb3f0" />
    </svg>
  );
}

// A left arrow, for the back button.
export function BackIcon() {
  return (
    <svg className="icon icon-back" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Nine dots, for the Menu button.
export function MenuDotsIcon() {
  return (
    <svg className="icon icon-dots" viewBox="0 0 24 24" aria-hidden="true">
      {[5, 12, 19].flatMap((y) => [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill="currentColor" />))}
    </svg>
  );
}

// Two people, for "Two Players".
export function TwoPlayersIcon() {
  return (
    <svg className="icon icon-two" viewBox="0 0 32 24" aria-hidden="true">
      <circle cx="11" cy="7" r="5" fill="currentColor" />
      <path d="M1 23c0-6 4.5-9.5 10-9.5S21 17 21 23z" fill="currentColor" />
      <circle cx="22.5" cy="8" r="4" fill="currentColor" opacity="0.75" />
      <path d="M19 14.2c1-.4 2.2-.7 3.5-.7 4.6 0 8.5 3 8.5 9.5h-8.4c0-3.8-1.3-6.8-3.6-8.8z" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

// A circled "i", for "more about this".
export function InfoIcon() {
  return (
    <svg className="icon icon-info" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="7.6" r="1.3" fill="currentColor" />
      <rect x="10.9" y="10.5" width="2.2" height="7" rx="1.1" fill="currentColor" />
    </svg>
  );
}

// Two sparkles, for "Why this move?".
export function SparkleIcon() {
  return (
    <svg className="icon icon-sparkle" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 2l1.8 5.2L21 9l-5.2 1.8L14 16l-1.8-5.2L7 9l5.2-1.8z" fill="currentColor" />
      <path d="M6 13l1 2.9L10 17l-3 1.1L6 21l-1-2.9L2 17l3-1.1z" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

// A laurel branch beside the title. `flip` mirrors it for the right side.
export function LaurelIcon({ flip = false }: { flip?: boolean }) {
  const leaves = [
    { cx: 9.5, cy: 28, r: -40 },
    { cx: 7.5, cy: 22, r: -20 },
    { cx: 7, cy: 16, r: 0 },
    { cx: 8, cy: 10, r: 20 },
    { cx: 15.5, cy: 25, r: 35 },
    { cx: 13, cy: 19, r: 30 },
    { cx: 12.5, cy: 13, r: 25 },
  ];
  return (
    <svg className="icon icon-laurel" viewBox="0 0 24 36" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M16 34C9 28 7 18 10 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {leaves.map(({ cx, cy, r }) => (
        <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="2" ry="4" transform={`rotate(${r} ${cx} ${cy})`} fill="currentColor" />
      ))}
    </svg>
  );
}
