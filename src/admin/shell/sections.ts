// The dashboard's sections, in the order of the menu, with their paths
// under /admin. D111: grouped like the owner's mockup, each with an icon and
// a one line subtitle under the page title.
import type { IconName } from "./icons";

export interface Section {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly subtitle: string;
}
export interface SectionGroup {
  readonly label: string | null;
  readonly sections: readonly Section[];
}

export const GROUPS: readonly SectionGroup[] = [
  { label: null, sections: [{ id: "overview", label: "Overview", icon: "home", subtitle: "Game performance at a glance" }] },
  { label: "Players", sections: [
    { id: "players", label: "All Players", icon: "users", subtitle: "Every profile, with search, filters and moderation" },
    { id: "live", label: "Live Players", icon: "live", subtitle: "Who is playing right now" },
    { id: "winners", label: "Leaderboard", icon: "trophy", subtitle: "Public rankings and the top winners" },
  ] },
  { label: "Game Analytics", sections: [
    { id: "ai-games", label: "AI Games", icon: "gamepad", subtitle: "Games against the AI, by day and level" },
    { id: "results", label: "Game Results", icon: "bars", subtitle: "How players do against the AI" },
    { id: "activity", label: "Activity & Retention", icon: "trend", subtitle: "Visitors, active players and registrations" },
  ] },
  { label: "Moderation", sections: [
    { id: "reports", label: "Reports", icon: "shield", subtitle: "Reported games and the players to review" },
    { id: "suspensions", label: "Suspensions", icon: "gavel", subtitle: "Suspended and banned players" },
    { id: "resigned", label: "Resignations", icon: "flag", subtitle: "Resigned and abandoned games" },
  ] },
  { label: "System", sections: [
    { id: "countries", label: "Countries", icon: "database", subtitle: "Players by the flag they chose" },
    { id: "audit", label: "Audit Log", icon: "file", subtitle: "Every sign in and admin action, newest first" },
    { id: "settings", label: "Settings", icon: "gear", subtitle: "Your account and this session" },
  ] },
];

export const SECTIONS: readonly Section[] = GROUPS.flatMap((group) => group.sections);

export const sectionById = (id: string): Section => SECTIONS.find((section) => section.id === id) ?? SECTIONS[0]!;

/** The section in a path such as /admin/players; the overview otherwise. */
export function sectionFromPath(path: string): Section {
  const id = /^\/admin\/([a-z-]+)\/?$/.exec(path)?.[1];
  return sectionById(id ?? "overview");
}

export const pathOf = (section: Section) => (section.id === "overview" ? "/admin/" : `/admin/${section.id}`);
