import type { PlayerRow } from "./protocol";

export const LEVEL_NAMES = ["Easy", "Medium", "Hard", "Strongest"] as const;
export function statusLabels(player: PlayerRow, now: Date): string[] {
  const labels: string[] = [];
  if (player.suspensionKind === "permanent") labels.push("Banned");
  else if (player.suspendedUntil && Date.parse(player.suspendedUntil) > now.getTime()) labels.push("Suspended");
  if (player.hidden) labels.push("Hidden");
  if (player.deviceBanned) labels.push("Device banned");
  return labels.length ? labels : ["Active"];
}

// Quote every cell and neutralize spreadsheet formulas, including formulas
// preceded by whitespace. CSV exports contain only the selected list page.
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '\"\"')}"`;
}
export function playersCsv(rows: readonly PlayerRow[]): string {
  const headers = ["Player ID", "Username", "Country", "Joined UTC", "Last active UTC", "Wins", "Easy wins", "Medium wins", "Hard wins", "Strongest wins", "Games", "Losses", "Draws", "Resigned", "Abandoned", "Reports", "Unique reporters", "Hidden", "Suspended until UTC", "Suspension kind", "Device banned"];
  const values = rows.map((row) => [row.id, row.username, row.country, row.joinedAt, row.lastActiveAt, row.wins, ...row.winsByLevel,
    row.games, row.losses, row.draws, row.resigned, row.abandoned, row.reports, row.reporters, row.hidden, row.suspendedUntil, row.suspensionKind, row.deviceBanned]);
  return [headers, ...values].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export interface PlayerDetail {
  readonly player: {
    readonly id: string; readonly username: string; readonly country: string | null; readonly avatar: string | null;
    readonly hidden: boolean; readonly createdAt: string; readonly usernameChangedAt: string | null; readonly lastSeenAt: string | null;
    readonly reportsActive: number; readonly suspendedUntil: string | null; readonly suspensionKind: string | null;
    readonly suspensionReason: string | null; readonly suspendedBy: string | null; readonly suspendedAt: string | null;
    readonly suspensionRevisedAt: string | null; readonly device: string; readonly ip: string; readonly deviceBanned: boolean;
  };
  readonly stats: Readonly<Record<string, number>> | null;
  readonly devices: readonly string[];
  readonly reservations: readonly { username: string; until: string }[];
  readonly games: readonly { game_id: string; level: number; result: string; resigned: boolean; abandoned: boolean; created_at: string }[];
  readonly wins: readonly { id: string; level: number; move_count: number; hidden: boolean; created_at: string }[];
  readonly reportsAgainst: readonly PlayerReport[];
  readonly reportsMade: readonly PlayerReport[];
  readonly adminHistory: readonly { id: number; at: string; admin: string | null; action: string; outcome: string; reason: string | null }[];
  readonly rooms: boolean;
}
export interface PlayerReport {
  readonly key?: string; readonly id?: string; readonly source?: string; readonly reporter?: string | null;
  readonly reason: string; readonly detail?: string | null; readonly game?: string; readonly room_code?: string;
  readonly created_at: string; readonly status: string; readonly review_note: string | null;
}
