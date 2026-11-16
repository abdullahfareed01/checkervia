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

// Three lines (a hamburger), for the Menu button.
export function MenuIcon() {
  return (
    <svg className="icon icon-menu" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// A chevron, for the previous and next move buttons.
export function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg className="icon icon-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A flag on a pole, for Resign.
export function FlagIcon() {
  return (
    <svg className="icon icon-flag" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 21V4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6 4.5h11l-2.5 4 2.5 4H6z" fill="currentColor" />
    </svg>
  );
}

// A circular arrow, for New game.
export function RestartIcon() {
  return (
    <svg className="icon icon-restart" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M19.5 3.5v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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

// ---------- The result panel's icons (D51, after mockup/winner_screen.png) ----------

// A stack of pieces, for "Pieces left".
export function PiecesIcon() {
  return (
    <svg className="icon icon-pieces" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 13v4c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-4c0 1.8-3.6 3.2-8 3.2S4 14.8 4 13z" fill="currentColor" opacity="0.55" />
      <path d="M4 8v4c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V8c0 1.8-3.6 3.2-8 3.2S4 9.8 4 8z" fill="currentColor" opacity="0.75" />
      <ellipse cx="12" cy="8" rx="8" ry="3.2" fill="currentColor" />
    </svg>
  );
}

// Two crossed swords, for "Pieces captured".
export function SwordsIcon() {
  return (
    <svg className="icon icon-swords" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 4l11 11M20 4L9 15" />
        <path d="M12.5 17.5l5-5M11.5 17.5l-5-5" />
        <path d="M16 16l3.5 3.5M8 16l-3.5 3.5" />
      </g>
    </svg>
  );
}

// A zigzag arrow, for "Best multi jump".
export function JumpIcon() {
  return (
    <svg className="icon icon-jump" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18l5-5 4 4 8-8" />
        <path d="M14 9h6v6" />
        <path d="M3 6l3 3M6 6L3 9" />
      </g>
    </svg>
  );
}

// Two opposite arrows, for "Moves".
export function SwapIcon() {
  return (
    <svg className="icon icon-swap" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8h15M15 4l4 4-4 4" />
        <path d="M20 16H5M9 12l-4 4 4 4" />
      </g>
    </svg>
  );
}

// An hourglass, for the moves in total.
export function HourglassIcon() {
  return (
    <svg className="icon icon-hourglass" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h12M6 21h12" />
        <path d="M8 3v2c0 3 4 5 4 7s-4 4-4 7v2M16 3v2c0 3-4 5-4 7s4 4 4 7v2" />
      </g>
      <path d="M9.5 19.5c0-1.8 2.5-3 2.5-3s2.5 1.2 2.5 3z" fill="currentColor" />
    </svg>
  );
}

// A stopwatch, for the game time.
export function StopwatchIcon() {
  return (
    <svg className="icon icon-stopwatch" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="14" r="7" />
        <path d="M10 3h4M12 3v4M12 14l3-3M18.5 6.5l1.5-1.5" />
      </g>
    </svg>
  );
}

// A play triangle, for Play Again.
export function PlayIcon() {
  return (
    <svg className="icon icon-play" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor" />
    </svg>
  );
}

// A bulleted list, for Review Game.
export function ListIcon() {
  return (
    <svg className="icon icon-list" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="currentColor">
        <circle cx="4.5" cy="6" r="1.8" />
        <circle cx="4.5" cy="12" r="1.8" />
        <circle cx="4.5" cy="18" r="1.8" />
      </g>
      <path d="M9 6h12M9 12h12M9 18h12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// A light bulb, for the tips.
export function BulbIcon() {
  return (
    <svg className="icon icon-bulb" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a6 6 0 0 0-3.8 10.6c.8.7 1.3 1.6 1.3 2.6V17h5v-.8c0-1 .5-1.9 1.3-2.6A6 6 0 0 0 12 3z" />
        <path d="M10 20h4" />
      </g>
    </svg>
  );
}

// ---------- The home menu's icons (D66, after the owner's menu mockup) ----------

// A graduation cap, for Learn.
export function GradCapIcon() {
  return (
    <svg className="icon icon-gradcap" viewBox="0 0 48 40" aria-hidden="true">
      <path d="M11 19v9c0 3.5 6 7 13 7s13-3.5 13-7v-9l-13 6z" fill="currentColor" opacity="0.8" />
      <path d="M24 4L2 14l22 10 22-10z" fill="currentColor" />
      <path d="M40 16.5v11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M38 27.5h4l1 6h-6z" fill="currentColor" />
    </svg>
  );
}

// A cog wheel, for Settings.
export function GearIcon() {
  return (
    <svg className="icon icon-gear" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.3 2h3.4l.5 2.6 1.8.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.8 2.6.5v3.4l-2.6.5-.8 1.8 1.5 2.2-2.4 2.4-2.2-1.5-1.8.8-.5 2.6h-3.4l-.5-2.6-1.8-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.8L2 13.7v-3.4l2.6-.5.8-1.8-1.5-2.2 2.4-2.4 2.2 1.5 1.8-.8zM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

// A page with lines, for the Terms.
export function DocumentIcon() {
  return (
    <svg className="icon icon-document" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------- The game Menu and its dialogs ----------

// A house with a door, for Main menu.
export function HomeIcon() {
  return (
    <svg className="icon icon-home" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2L2.5 11.2l1.3 1.5L5 11.7V21h5.5v-6h3v6H19v-9.3l1.2 1 1.3-1.5z" fill="currentColor" />
    </svg>
  );
}

// An exclamation mark in a ring, for questions that would lose something.
export function AlertIcon() {
  return (
    <svg className="icon icon-alert" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="10.8" y="6.4" width="2.4" height="7.6" rx="1.2" fill="currentColor" />
      <circle cx="12" cy="17.2" r="1.45" fill="currentColor" />
    </svg>
  );
}

// ---------- The Settings sheet's tiles ----------

// A speaker with two sound waves, for Sound.
export function SpeakerIcon() {
  return (
    <svg className="icon icon-speaker" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9h4l5.5-4.5v15L7 15H3z" fill="currentColor" />
      <path d="M16 8.5a5 5 0 0 1 0 7M18.6 5.8a8.8 8.8 0 0 1 0 12.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// A phone with shake marks either side, for Haptics.
export function VibrateIcon() {
  return (
    <svg className="icon icon-vibrate" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 2.5h7a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM9 5v13.5h6V5z" fill="currentColor" fillRule="evenodd" />
      <path d="M3.5 8.5l-1.5 1.75 1.5 1.75-1.5 1.75 1.5 1.75M20.5 8.5l1.5 1.75-1.5 1.75 1.5 1.75-1.5 1.75" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A microphone, for the AI voice.
export function MicIcon() {
  return (
    <svg className="icon icon-mic" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// A small checkered board, for Board and pieces.
export function BoardIcon() {
  return (
    <svg className="icon icon-board" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM5 5v4.7h4.7V5zm9.3 0v4.7H19V5zM9.7 9.7v4.6h4.6V9.7zM5 14.3V19h4.7v-4.7zm9.3 0V19H19v-4.7z" fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

// A speech bubble with three dots, for the AI chat.
export function ChatIcon() {
  return (
    <svg className="icon icon-chat" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3.5h14a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5h-8l-5 4v-4H5A2.5 2.5 0 0 1 2.5 15V6A2.5 2.5 0 0 1 5 3.5zM7.5 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm4.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm4.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

// ---------- Focus mode (D88) ----------

// Four corners pointing out, for Focus mode.
export function FocusIcon() {
  return (
    <svg className="icon icon-focus" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Four corners pointing in (the small screen), for leaving Focus mode: the
// Focus mode symbol turned inside out, as a video player's exit full screen.
export function FocusExitIcon() {
  return (
    <svg className="icon icon-focus-exit" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A speech bubble, crossed out while the AI's chat is muted.
export function ChatMuteIcon({ muted }: { muted: boolean }) {
  return (
    <svg className="icon icon-chat-mute" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3.5v-3.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {muted ? <path d="M4 3l16 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /> : <path d="M8 10.5h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
