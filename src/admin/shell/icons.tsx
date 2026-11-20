// D111: the dashboard's line icons, drawn here (no icon dependency). Every
// icon is decorative; the text beside it, or the button's label, names it.
const PATHS = {
  home: "M3 11.5 12 4l9 7.5M5.5 10v10h4.5v-6h4v6h4.5V10",
  users: "M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM3 20c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6M16.5 11.4a2.6 2.6 0 1 0 0-5.2M17 14.6c2.4.3 4 2.2 4 4.9",
  live: "M12 13.8a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M5.7 5.7a8.9 8.9 0 0 0 0 12.6M18.3 5.7a8.9 8.9 0 0 1 0 12.6",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4.2M16 6h3a3 3 0 0 1-3 4.2M12 13v3.5M8.5 20h7M10 16.5h4V20h-4z",
  gamepad: "M7.2 8h9.6a4 4 0 0 1 4 4.3l-.4 3.4a2.4 2.4 0 0 1-4.2 1.3L14.6 15H9.4l-1.6 2a2.4 2.4 0 0 1-4.2-1.3l-.4-3.4A4 4 0 0 1 7.2 8ZM8 10.5v3.4M6.3 12.2h3.4M15.2 11.4h.01M17.4 13.4h.01",
  bars: "M4 20h16M6.5 16.5V12M10.5 16.5V7.5M14.5 16.5v-6M18.5 16.5V5",
  trend: "M3 17.5 9 11.5l4 4 7.5-7.5M14.5 8h6v6",
  shield: "M12 3.2 19.5 6v5.8c0 4.4-3.1 7.9-7.5 9-4.4-1.1-7.5-4.6-7.5-9V6L12 3.2ZM9 12l2.1 2.1L15.2 10",
  gavel: "M13.6 3.6l6.8 6.8M10.4 6.8l6.8 6.8M12 5.2l-3.2 3.2 6.8 6.8 3.2-3.2M10.6 13.4 4 20M3.5 21h8",
  flag: "M5.5 21V4M5.5 4.5h11l-2.2 4 2.2 4h-11",
  database: "M12 8.8c3.9 0 7-1.3 7-2.9S15.9 3 12 3 5 4.3 5 5.9s3.1 2.9 7 2.9ZM5 5.9v12.2C5 19.7 8.1 21 12 21s7-1.3 7-2.9V5.9M5 12c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9",
  file: "M14 3H7.2A2.2 2.2 0 0 0 5 5.2v13.6A2.2 2.2 0 0 0 7.2 21h9.6a2.2 2.2 0 0 0 2.2-2.2V8L14 3ZM14 3v5h5M9 13h6M9 16.8h6",
  gear: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM10.3 3h3.4l.5 2.4 1.7 1 2.3-.8 1.7 2.9-1.8 1.6v2l1.8 1.6-1.7 2.9-2.3-.8-1.7 1-.5 2.4h-3.4l-.5-2.4-1.7-1-2.3.8-1.7-2.9L5.6 13v-2L3.8 9.4l1.7-2.9 2.3.8 1.7-1z",
  bell: "M6.2 16.5V11a5.8 5.8 0 0 1 11.6 0v5.5l1.7 2H4.5zM10 20.5a2.1 2.1 0 0 0 4 0",
  calendar: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM3 10h18M8 3v4M16 3v4",
  refresh: "M20 12a8 8 0 1 1-2.4-5.7M20.2 4v5h-5",
  download: "M12 4v11M7.2 10.4 12 15.2l4.8-4.8M4 19.5h16",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.2M12 7.6h.01",
  close: "M6 6l12 12M18 6 6 18",
  chevronRight: "M9.5 6l6 6-6 6",
  chevronDown: "M6 9.5l6 6 6-6",
  warning: "M12 3.5 21.5 20h-19L12 3.5ZM12 10v4.8M12 17.6h.01",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.7 5.7l12.6 12.6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.4 2",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z",
  wifi: "M2.5 9a14.5 14.5 0 0 1 19 0M5.8 12.4a9.6 9.6 0 0 1 12.4 0M9.1 15.8a4.8 4.8 0 0 1 5.8 0M12 19.4h.01",
  pulse: "M2.5 12h4l2.6-6.5 4.6 13 2.8-6.5h5",
  userPlus: "M9 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM2.8 20c0-3.5 2.8-5.8 6.2-5.8s6.2 2.3 6.2 5.8M19 8v6M16 11h6",
  exit: "M10 4H5.5v16H10M14.5 8l4 4-4 4M18.5 12H9.5",
  arrowUp: "M12 19V5.5M6.5 11 12 5.5 17.5 11",
  arrowDown: "M12 5v13.5M6.5 13 12 18.5 17.5 13",
  diamond: "M7 4h10l4 5.2L12 20 3 9.2 7 4ZM3 9.2h18M12 20 8.6 9.2 10.5 4M12 20l3.4-10.8L13.5 4",
  menu: "M4 7h16M4 12h16M4 17h16",
  logout: "M14.5 4H19v16h-4.5M10 8l-4 4 4 4M6 12h10",
  play: "M8 5.2v13.6L19 12z",
  crown: "M3.5 8.5 7.8 12 12 5.5l4.2 6.5 4.3-3.5L18.6 18H5.4z M5.5 20.5h13",
  star: "M12 3.5l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.8l-5.4 2.9 1.2-5.9L3.4 9.7l6-.7z",
} as const;

export type IconName = keyof typeof PATHS;
const FILLED = new Set<IconName>(["play", "crown", "star"]);

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg className={`adm-icon${className ? ` ${className}` : ""}`} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d={PATHS[name]} className={FILLED.has(name) ? "adm-icon-fill" : undefined} />
  </svg>;
}
