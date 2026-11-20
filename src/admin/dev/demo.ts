// Development only (D100): answers admin-auth and admin-api in the page, so
// every admin screen can be opened and checked (scripts/check-layout.mjs)
// without Supabase. ?demo=signin starts signed out; enroll and verify go
// to that sign in step after any password; app starts signed in.
import { replaceTransport } from "../api";
import { ADMIN_API_PATH } from "../protocol";
import { overviewRange, periodSums, previousRange } from "../analytics";
import type { OverviewData, OverviewPeriod } from "../analytics";
import type { CountriesData, ResignedData, WinnersData } from "../reports";
import type { AuditQuery } from "../protocol";
import type { AuditRow, PlayerRow, PlayerSort, PlayersQuery } from "../protocol";
import { decodeCursor, encodeCursor } from "../protocol";
import type { PlayerDetail } from "../players";
import type { LiveData, ReportGroup, ReportRow, ReportStatus } from "../moderation";
import { statusLabels } from "../players";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const QR = `data:image/svg+xml;utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1zM10 10h2v2h-2zM14 14h3v3h-3z" fill="#000"/></svg>')}`;

function activity(): AuditRow[] {
  const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const row = (id: number, action: string, outcome: AuditRow["outcome"], minutes: number, targetLabel: string | null = null): AuditRow => ({
    id, at: at(minutes), adminEmail: "owner@example.com", action, outcome, reason: null, targetPlayer: null, targetLabel, details: {},
  });
  return [
    row(8, "auth.signin", "ok", 1),
    row(7, "auth.password", "ok", 2),
    row(6, "auth.code", "refused", 3),
    row(5, "player.view", "ok", 60, "Grandmaster_Wolf_With_A_Long_Name"),
    row(4, "access.refused", "refused", 120),
    row(3, "auth.signin", "refused", 300),
    row(2, "auth.signout", "ok", 1440),
    row(1, "auth.enroll", "ok", 2000),
  ];
}

// Fake counts stay inside the development-only chunk, never the live API.
export function demoOverview(period: OverviewPeriod, empty = false, now = new Date()): OverviewData {
  const range = overviewRange(period, now);
  // 180 days, so a 90 day window also has the window before it (D111).
  const start = new Date(`${overviewRange("90", now).from}T00:00:00.000Z`); start.setUTCDate(start.getUTCDate() - 90);
  let registered = 0;
  const records = Array.from({ length: 180 }, (_, index) => {
    const day = new Date(start); day.setUTCDate(day.getUTCDate() + index);
    // The last 90 days (i from 0) are the samples from before D111; the 90
    // days before them only have play, so the 60 sample profiles stay 60.
    const i = index - 90;
    const registrations = empty || i < 0 || i % 3 === 0 ? 0 : 1; registered += registrations;
    const wave = (Math.sin(i * 0.43) + 1) * 0.5;
    const active = empty ? 0 : i < 0 ? Math.round(6 + wave * 12) : Math.min(registered, Math.round(8 + wave * 16 + i / 7));
    const games = active * (2 + (i % 3 + 3) % 3);
    const levels = [1, 2, 3, 4].map((level) => {
      const played = Math.floor(games / 4) + (level <= games % 4 ? 1 : 0);
      const wins = Math.floor(played * (0.75 - level * 0.12));
      const draws = Math.floor(played * 0.06);
      const losses = played - wins - draws;
      return { level, games: played, wins, losses, draws, resigned: Math.floor(losses * 0.18), abandoned: Math.floor(losses * 0.1) };
    });
    const sum = (key: "wins" | "losses" | "draws" | "resigned" | "abandoned") => levels.reduce((total, row) => total + row[key], 0);
    return { day: day.toISOString().slice(0, 10), registrations, deletions: 0, registered,
      visitors: empty ? 0 : Math.max(12, Math.round(30 + wave * 95 + i * 1.2)), active, games,
      wins: sum("wins"), losses: sum("losses"), draws: sum("draws"), resigned: sum("resigned"), abandoned: sum("abandoned"), onlineGames: Math.floor(games / 6), levels };
  });
  const selected = records.filter((row) => row.day >= range.from);
  const before = previousRange(range);
  const earlier = before ? records.filter((row) => row.day >= before.from && row.day <= before.to).map(({ levels: _levels, ...row }) => row) : null;
  const sum = (key: "registrations" | "visitors" | "games" | "resigned" | "abandoned" | "onlineGames") => selected.reduce((total, row) => total + row[key], 0);
  const weeks = new Map<string, number>();
  selected.forEach((row) => {
    const monday = new Date(`${row.day}T00:00:00.000Z`); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const week = monday.toISOString().slice(0, 10);
    weeks.set(week, Math.max(weeks.get(week) ?? 0, Math.min(row.registered, row.active + (empty ? 0 : 8))));
  });
  return { range, previous: earlier && periodSums(earlier), daily: selected.map(({ levels: _levels, ...row }) => row), weekly: [...weeks].map(([week, active]) => ({ week, active })), totals: {
    registered, newPlayers: sum("registrations"), visitors: sum("visitors"), visitorsToday: selected.at(-1)?.visitors ?? 0,
    onlineNow: empty ? 0 : 12, games: sum("games"), onlineGames: sum("onlineGames"), resigned: sum("resigned"), abandoned: sum("abandoned"),
    openReports: empty ? 0 : 8, suspended: empty ? 0 : 5,
    levels: [1, 2, 3, 4].map((level) => {
      const sums = { level, games: 0, wins: 0, losses: 0, draws: 0, resigned: 0, abandoned: 0 };
      selected.forEach((row) => { const value = row.levels[level - 1]!; for (const key of ["games", "wins", "losses", "draws", "resigned", "abandoned"] as const) sums[key] += value[key]; });
      return sums;
    }),
  } };
}

export function demoPlayers(now = new Date()): PlayerRow[] {
  return Array.from({ length: 60 }, (_, index) => {
    const id = index + 1;
    const at = new Date(now.getTime() - index * 86400000).toISOString();
    return { id: `55555555-5555-4555-8555-${String(id).padStart(12, "0")}`, username: id === 1 ? "VeryLongPlayer01" : `Player_${String(id).padStart(2, "0")}`,
      avatar: null, country: index % 3 === 0 ? "PK" : index % 3 === 1 ? "GB" : null, joinedAt: at, lastActiveAt: at,
      hidden: id % 7 === 0, suspendedUntil: id % 11 === 0 ? "2027-01-01T00:00:00Z" : null,
      suspensionKind: id % 11 === 0 ? "admin" : null, deviceBanned: id % 13 === 0,
      wins: id * 10, winsByLevel: [id, id * 2, id * 3, id * 4], games: id * 20, losses: id * 9,
      draws: id, resigned: id * 2, abandoned: id, reports: id, reporters: 1 };
  });
}
export function demoPlayerPage(all: readonly PlayerRow[], query: PlayersQuery) {
  const stat = (row: PlayerRow, key: PlayerSort) => key === "joined" ? row.joinedAt : key === "active" ? row.lastActiveAt : key === "name" ? row.username : row[key];
  const from = (value: string, minimum?: string, maximum?: string) => (!minimum || value >= minimum) && (!maximum || value <= maximum);
  const rows = all.filter((row) => (!query.search || row.username.toLowerCase().includes(query.search.toLowerCase())) &&
    (!query.country || (query.country === "none" ? row.country === null : row.country === query.country)) &&
    (!query.level || row.winsByLevel[query.level - 1]! > 0) &&
    (!query.status || (query.status === "reported" ? row.reports > 0 : query.status === "device" ? row.deviceBanned : statusLabels(row, new Date()).some((value) => value.toLowerCase() === query.status))) &&
    from(row.joinedAt, query.joinedFrom, query.joinedTo) && from(row.lastActiveAt, query.activeFrom, query.activeTo));
  const sort = query.sort ?? "joined";
  rows.sort((a, b) => {
    const left = stat(a, sort), right = stat(b, sort);
    const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return (query.desc === false ? 1 : -1) * (order || a.id.localeCompare(b.id));
  });
  const after = query.cursor ? decodeCursor(query.cursor) : null;
  const start = after ? rows.findIndex((row) => row.id === after[1]) + 1 : 0;
  const shown = rows.slice(start, start + (query.limit ?? 25));
  const last = shown.at(-1);
  return { rows: shown, next: last && start + shown.length < rows.length ? encodeCursor(stat(last, sort), last.id) : null };
}
export function demoPlayerDetail(row: PlayerRow): PlayerDetail {
  return { player: { id: row.id, username: row.username, country: row.country, avatar: null, hidden: row.hidden,
    createdAt: row.joinedAt, usernameChangedAt: null, lastSeenAt: row.lastActiveAt, reportsActive: row.reports,
    suspendedUntil: row.suspendedUntil, suspensionKind: row.suspensionKind, suspensionReason: row.suspendedUntil ? "Review requested by moderator" : null,
    suspendedBy: row.suspendedUntil ? "owner@example.com" : null, suspendedAt: null, suspensionRevisedAt: null,
    device: "device123456", ip: "address12345", deviceBanned: row.deviceBanned },
    stats: { wins: row.wins, wins_1: row.winsByLevel[0], wins_2: row.winsByLevel[1], wins_3: row.winsByLevel[2], wins_4: row.winsByLevel[3], games: row.games, losses: row.losses, draws: row.draws, resigned: row.resigned, abandoned: row.abandoned },
    devices: ["device123456"], reservations: [],
    games: [{ game_id: "66666666-6666-4666-8666-666666666666", level: 2, result: "loss", resigned: false, abandoned: true, created_at: row.lastActiveAt }],
    wins: [{ id: "77777777-7777-4777-8777-777777777777", level: 4, move_count: 31, hidden: false, created_at: row.lastActiveAt }],
    reportsAgainst: [{ key: "ai:game", source: "ai", reason: "abandoned", created_at: row.lastActiveAt, status: "open", review_note: null }],
    reportsMade: [], adminHistory: [], rooms: false };
}

export function demoCountries(period: OverviewPeriod, empty = false): CountriesData {
  const overview = demoOverview(period, empty);
  if (empty) return { range: overview.range, rows: [] };
  const countries = ["PK", "GB", ""];
  const portion = (total: number, index: number) => index === 2 ? total - Math.floor(total * 0.45) - Math.floor(total * 0.35) : Math.floor(total * (index === 0 ? 0.45 : 0.35));
  return { range: overview.range, rows: countries.map((country, index) => ({ country, players: 20,
    signups: portion(overview.totals.newPlayers, index), games: portion(overview.totals.games, index), onlineNow: portion(overview.totals.onlineNow, index) })) };
}
export function demoWinners(period: OverviewPeriod, level: number, empty = false): WinnersData {
  const overview = demoOverview(period, empty), totals = overview.totals.levels.find((row) => row.level === level);
  const candidates = demoPlayers().filter((row) => !row.hidden).slice(0, 4);
  return { range: overview.range, level, levels: overview.totals.levels,
    rows: empty ? [] : candidates.map((row, i) => ({ rank: i + 1, playerId: row.id, username: row.username, country: row.country,
      wins: Math.floor((totals?.wins ?? 0) * (4 - i) / 10), bestMoves: 20 + i * 3, games: Math.floor((totals?.games ?? 0) * (4 - i) / 10) })).filter((row) => row.wins > 0),
    top: empty ? [] : demoPlayers().sort((a, b) => b.wins - a.wins).slice(0, 25).map((row) => ({ playerId: row.id, username: row.username, country: row.country, hidden: row.hidden, wins: row.wins, games: row.games })),
  };
}
export function demoResigned(period: OverviewPeriod, empty = false): ResignedData {
  const overview = demoOverview(period, empty);
  return { range: overview.range, levels: overview.totals.levels,
    daily: overview.daily.flatMap((row) => {
      return [1, 2, 3, 4].map((level) => {
        const games = Math.floor(row.games / 4) + (level <= row.games % 4 ? 1 : 0);
        const wins = Math.floor(games * (0.75 - level * 0.12)), draws = Math.floor(games * 0.06), losses = games - wins - draws;
        return { day: row.day, level, games, wins, losses, draws, resigned: Math.floor(losses * 0.18), abandoned: Math.floor(losses * 0.1) };
      });
    }),
    rows: empty ? [] : demoPlayers().slice(0, 3).map((row, index) => ({ playerId: row.id, username: row.username, country: row.country,
      resigned: Math.floor(overview.totals.resigned * (3 - index) / 6), abandoned: Math.floor(overview.totals.abandoned * (3 - index) / 6), games: Math.floor(overview.totals.games * (3 - index) / 6) })).filter((row) => row.resigned > 0),
  };
}
export function demoAuditPage(query: AuditQuery, empty = false, now = new Date()) {
  const base = activity();
  const before = query.cursor ? Number(decodeCursor(query.cursor)?.[0]) : Infinity;
  const rows = empty ? [] : Array.from({ length: 65 }, (_, i) => {
    const row = base[i % base.length]!;
    return { ...row, id: 65 - i, at: new Date(now.getTime() - i * 60_000).toISOString(), reason: i % 3 === 0 ? "Owner reviewed the requested change" : null };
  }).filter((row) => row.id < before && (!query.action || row.action === query.action) && (!query.playerId || row.targetPlayer === query.playerId) &&
    (!query.search || [row.action, row.adminEmail, row.targetLabel, row.reason].join(" ").toLowerCase().includes(query.search.toLowerCase())));
  const shown = rows.slice(0, query.limit ?? 25);
  return { rows: shown, next: rows.length > shown.length ? encodeCursor(shown.at(-1)!.id, "") : null };
}

// ---------- Phase 3 samples (D110): reports, live play, actions ----------

const ROOM_REASONS = ["Rude chat", "Stalling on purpose", "Offensive username", "Left the game"] as const;
export function demoReports(players: readonly PlayerRow[], now = new Date()): ReportRow[] {
  const statuses: readonly ReportStatus[] = ["open", "open", "open", "reviewed", "dismissed", "actioned"];
  return Array.from({ length: 36 }, (_, i) => {
    const reported = players[i % 12]!, reporter = players[(i * 7 + 3) % players.length]!;
    const ai = i % 3 !== 1, game = `66666666-6666-4666-8666-${String(i + 1).padStart(12, "0")}`;
    const status = statuses[i % statuses.length]!;
    return { source: ai ? "ai" : "room", key: ai ? `${reported.id}:${game}` : `88888888-8888-4888-8888-${String(i + 1).padStart(12, "0")}`,
      reportedId: reported.id, reported: reported.username, reporterId: ai ? null : reporter.id, reporter: ai ? "AI" : reporter.username,
      reason: ai ? "abandoned" : ROOM_REASONS[i % ROOM_REASONS.length]!, detail: ai ? (i % 2 ? "middle" : "end") : null,
      game: ai ? game : `ROOM${i}`, level: ai ? (i % 4) + 1 : null, createdAt: new Date(now.getTime() - i * 3_600_000 * 5).toISOString(),
      status, reviewNote: status === "open" ? null : "Checked the game history" };
  });
}
export function demoReportGroups(reports: readonly ReportRow[], players: readonly PlayerRow[], status?: ReportStatus): ReportGroup[] {
  const byPlayer = new Map<string, ReportRow[]>();
  for (const row of reports) byPlayer.set(row.reportedId, [...(byPlayer.get(row.reportedId) ?? []), row]);
  return [...byPlayer].filter(([, rows]) => !status || rows.some((row) => row.status === status)).flatMap(([id, rows]) => {
    const player = players.find((row) => row.id === id);
    return player ? [{ playerId: id, username: player.username, country: player.country, reports: rows.length,
      reporters: new Set(rows.map((row) => row.reporterId ?? "ai")).size, open: rows.filter((row) => row.status === "open").length,
      lastAt: rows.map((row) => row.createdAt).sort().at(-1)!, suspendedUntil: player.suspendedUntil, hidden: player.hidden }] : [];
  }).sort((a, b) => b.open - a.open || b.reporters - a.reporters || b.reports - a.reports || b.lastAt.localeCompare(a.lastAt));
}
export function demoReportPage(reports: readonly ReportRow[], query: { status?: unknown; source?: unknown; playerId?: unknown; cursor?: unknown; limit?: unknown }) {
  const rows = reports.filter((row) => (!query.status || row.status === query.status) && (!query.source || row.source === query.source) && (!query.playerId || row.reportedId === query.playerId));
  const after = typeof query.cursor === "string" ? decodeCursor(query.cursor) : null;
  const start = after ? rows.findIndex((row) => row.key === after[1]) + 1 : 0;
  const shown = rows.slice(start, start + (typeof query.limit === "number" ? query.limit : 25));
  return { rows: shown, next: start + shown.length < rows.length && shown.length ? encodeCursor(shown.at(-1)!.createdAt, shown.at(-1)!.key) : null };
}
export function demoLive(players: readonly PlayerRow[], empty = false, now = new Date()): LiveData {
  if (empty) return { online: 0, modes: {}, levels: {}, countries: [], roomGames: [], rooms: true };
  const person = (row: PlayerRow) => ({ id: row.id, username: row.username, country: row.country });
  return { online: 12, modes: { ai: 8, two: 1, online: 3 }, levels: { 1: 3, 2: 2, 3: 2, 4: 1 },
    countries: [{ country: "PK", n: 6, ai: 4, two: 1, online: 1 }, { country: "GB", n: 4, ai: 3, two: 0, online: 1 }, { country: "", n: 2, ai: 1, two: 0, online: 1 }],
    roomGames: [{ id: "99999999-9999-4999-8999-000000000001", number: 1, startedAt: new Date(now.getTime() - 420_000).toISOString(), moveCount: 23, black: person(players[2]!), white: person(players[4]!) }],
    rooms: true };
}

const WRITES = ["reportStatus", "suspend", "unsuspend", "deviceBan", "hidePlayer", "hideWin", "rename", "resetProfile", "deletePlayer"];

export function startDemo(mode: string): void {
  let signedIn = mode === "app";
  let overviewAttempts = 0;
  let players = demoPlayers();
  let reports = demoReports(players);
  const auditNow = new Date();
  const change = (id: unknown, update: (row: PlayerRow) => PlayerRow) => { players = players.map((row) => (row.id === id ? update(row) : row)); };
  const session = () => ({ accessToken: "demo.token.value", expiresAt: Math.floor(Date.now() / 1000) + 3600, email: "owner.with.a.long.address@example.com" });
  replaceTransport(async (path, body) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    const data = JSON.parse(body) as { action?: string; op?: string; params?: PlayersQuery & AuditQuery & { period?: OverviewPeriod; id?: string } };
    if (path === ADMIN_API_PATH) {
      if (!signedIn) return json({ error: "Please sign in again.", code: "noSession" }, 401);
      if (data.op === "overview") {
        const state = new URLSearchParams(location.search).get("stats");
        overviewAttempts++;
        if (state === "error" || (state === "retry" && overviewAttempts <= 2)) return json({ error: "Statistics could not be loaded. Try again.", code: "unavailable" }, 503);
        if (state === "race" && data.params?.period === "7") await new Promise((resolve) => setTimeout(resolve, 900));
        if (state === "slow") await new Promise((resolve) => setTimeout(resolve, 1400));
        return json(demoOverview(data.params?.period ?? "30", state === "empty"));
      }
      if (data.op === "players" || data.op === "playersExport") {
        const state = new URLSearchParams(location.search).get("players");
        if (state === "error") return json({ error: "Players could not be loaded. Try again.", code: "unavailable" }, 503);
        if (state === "slow") await new Promise((resolve) => setTimeout(resolve, 1400));
        return json(demoPlayerPage(state === "empty" ? [] : players, data.params ?? {}));
      }
      if (data.op === "player") {
        const row = players.find((player) => player.id === data.params?.id);
        return row ? json(demoPlayerDetail(row)) : json({ error: "No player with this id.", code: "notFound" }, 404);
      }
      const params = (data.params ?? {}) as Record<string, unknown>;
      const moderation = new URLSearchParams(location.search).get("moderation");
      if (data.op === "reports" || data.op === "reportGroups" || data.op === "live") {
        if (moderation === "error") return json({ error: "This list could not be loaded. Try again.", code: "unavailable" }, 503);
        const shown = moderation === "empty" ? [] : reports;
        if (data.op === "live") return json(demoLive(players, moderation === "empty"));
        if (data.op === "reportGroups") return json(demoReportGroups(shown, players, params["status"] as ReportStatus | undefined));
        return json(demoReportPage(shown, params));
      }
      if (WRITES.includes(data.op ?? "")) {
        const done = (message: string) => json({ done: true, message });
        if (typeof params["reason"] !== "string" || params["reason"].trim().length < 3) return json({ error: "Write a reason of 3 to 500 characters.", code: "reason" }, 400);
        if (moderation === "refuse") return json({ error: "Too many attempts. Please wait a moment.", code: "rateLimited" }, 429);
        if (data.op === "reportStatus") {
          reports = reports.map((row) => (row.key === params["key"] ? { ...row, status: params["status"] as ReportStatus, reviewNote: String(params["reason"]) } : row));
          return done("Report updated.");
        }
        if (data.op === "suspend") {
          const until = params["mode"] === "ban" ? "9999-12-31T00:00:00.000Z" : new Date(Date.now() + Number(params["days"]) * 86_400_000).toISOString();
          change(params["playerId"], (row) => ({ ...row, suspendedUntil: until, suspensionKind: params["mode"] === "ban" ? "permanent" : "admin" }));
          return done(params["mode"] === "ban" ? "Banned permanently." : `Suspended until ${until.slice(0, 10)} (UTC).`);
        }
        if (data.op === "unsuspend") { change(params["playerId"], (row) => ({ ...row, suspendedUntil: null, suspensionKind: null })); return done("Suspension lifted."); }
        if (data.op === "deviceBan") { change(params["playerId"], (row) => ({ ...row, deviceBanned: params["ban"] === true })); return done(params["ban"] ? "Device banned." : "Device unbanned."); }
        if (data.op === "hidePlayer") { change(params["playerId"], (row) => ({ ...row, hidden: params["hidden"] === true })); return done(params["hidden"] ? "Player hidden from public lists." : "Player shown again."); }
        if (data.op === "rename") {
          if (players.some((row) => row.username.toLowerCase() === String(params["username"]).toLowerCase())) return json({ error: "That username is taken or reserved.", code: "taken" }, 409);
          change(params["playerId"], (row) => ({ ...row, username: String(params["username"]) }));
          return done(`Renamed to ${String(params["username"])}.`);
        }
        if (data.op === "resetProfile") { change(params["playerId"], (row) => (params["field"] === "country" ? { ...row, country: null } : { ...row, avatar: null })); return done(params["field"] === "country" ? "Flag removed." : "Avatar reset."); }
        if (data.op === "deletePlayer") {
          players = players.filter((row) => row.id !== params["playerId"]);
          reports = reports.filter((row) => row.reportedId !== params["playerId"]);
          return done("Player deleted. The audit entry remains.");
        }
        return done(params["hidden"] ? "Win hidden from the ranking." : "Win counted again.");
      }
      if (["countries", "winners", "resigned", "audit"].includes(data.op ?? "")) {
        const state = new URLSearchParams(location.search).get("report");
        if (state === "error") return json({ error: "Report could not be loaded. Try again.", code: "unavailable" }, 503);
        if (state === "slow" || (state === "race" && data.params?.period === "7")) await new Promise((resolve) => setTimeout(resolve, 1000));
        const period = data.params?.period ?? "30", empty = state === "empty";
        if (data.op === "countries") return json(demoCountries(period, empty));
        if (data.op === "winners") return json(demoWinners(period, data.params?.level ?? 1, empty));
        if (data.op === "resigned") return json(demoResigned(period, empty));
        return json(demoAuditPage(data.params ?? {}, empty, auditNow));
      }
      return json({ rows: activity(), next: null });
    }
    switch (data.action) {
      case "refresh":
        return signedIn ? json(session()) : json({ error: "Please sign in again.", code: "noSession" }, 401);
      case "signIn":
        return json({ step: mode === "enroll" ? "enroll" : "verify", pendingToken: "demo.pending.token", factorId: mode === "enroll" ? null : "f" });
      case "enroll":
        return json({ factorId: "f", qrCode: QR, secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" });
      case "verify":
        signedIn = true;
        return json(session());
      default:
        signedIn = false;
        return json({ signedOut: true });
    }
  });
}
