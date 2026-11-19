// The dashboard's sections, in the order of the menu, with their paths
// under /admin. Every section is built (D110).
export interface Section {
  readonly id: string;
  readonly label: string;
}

export const SECTIONS: readonly Section[] = [
  { id: "overview", label: "Overview" },
  { id: "players", label: "Players" },
  { id: "reports", label: "Reports" },
  { id: "suspensions", label: "Suspensions" },
  { id: "live", label: "Live" },
  { id: "countries", label: "Countries" },
  { id: "winners", label: "Who is winning" },
  { id: "resigned", label: "Resigned games" },
  { id: "audit", label: "Audit log" },
];

export const sectionById = (id: string): Section => SECTIONS.find((section) => section.id === id) ?? SECTIONS[0]!;

/** The section in a path such as /admin/players; the overview otherwise. */
export function sectionFromPath(path: string): Section {
  const id = /^\/admin\/([a-z]+)\/?$/.exec(path)?.[1];
  return sectionById(id ?? "overview");
}

export const pathOf = (section: Section) => (section.id === "overview" ? "/admin/" : `/admin/${section.id}`);
