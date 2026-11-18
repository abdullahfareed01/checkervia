// The dashboard's sections, in the order of the menu, with their paths
// under /admin and what each one is for (shown while it is still empty).
export interface Section {
  readonly id: string;
  readonly label: string;
  readonly about: string;
}

export const SECTIONS: readonly Section[] = [
  { id: "overview", label: "Overview", about: "Players, visitors, games, reports and suspensions at a glance, with charts over 7, 30 or 90 days or all time." },
  { id: "players", label: "Players", about: "Every player, with search, filters, sorting, details and a CSV export." },
  { id: "reports", label: "Reports", about: "Open, reviewed, dismissed and actioned reports, grouped by player, with the number of different reporters." },
  { id: "suspensions", label: "Suspensions", about: "Suspended and banned players, with the days left, and the actions to lift, extend or ban." },
  { id: "live", label: "Live", about: "Who is playing now, by mode, level and country, and online room games in progress." },
  { id: "countries", label: "Countries", about: "Players, active players now and games for every flag." },
  { id: "winners", label: "Who is winning", about: "The real rankings by level and period, the top winners and the AI's record." },
  { id: "resigned", label: "Resigned games", about: "Resignations by level and day, the players who resign most, and abandoned games apart." },
  { id: "audit", label: "Audit log", about: "Every sign in and admin action, with its reason. It can never be changed." },
];

export const sectionById = (id: string): Section => SECTIONS.find((section) => section.id === id) ?? SECTIONS[0]!;

/** The section in a path such as /admin/players; the overview otherwise. */
export function sectionFromPath(path: string): Section {
  const id = /^\/admin\/([a-z]+)\/?$/.exec(path)?.[1];
  return sectionById(id ?? "overview");
}

export const pathOf = (section: Section) => (section.id === "overview" ? "/admin/" : `/admin/${section.id}`);
