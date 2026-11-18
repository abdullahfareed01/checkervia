// Migration 7 in PGlite (D101): the players list's keyset paging and
// filters, the chart queries on sample data, the heartbeat's expiry, the
// visitor count, and reports with unique reporters, with and without the
// online room tables (migration 6 before or after 7).
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addPlayer, addResult, addWin, adminDb, errorOf, one, rows, uuid } from "./pg";

const ADMIN = "00000000-0000-4000-8000-0000000000ad";
type PlayerRow = { id: string; username: string; wins: number; sort_value: string; reports: number; reporters: number };
const page = (db: PGlite, options: { search?: string; status?: string; country?: string; level?: number; sort?: string; desc?: boolean; after?: string | null; afterId?: string | null; limit?: number }) =>
  rows<PlayerRow>(db, "select * from admin_players($1, $2, $3, $4, null, null, null, null, $5, $6, $7, $8, $9)", [
    options.search ?? null,
    options.status ?? null,
    options.country ?? null,
    options.level ?? null,
    options.sort ?? "joined",
    options.desc ?? true,
    options.after ?? null,
    options.afterId ?? null,
    options.limit ?? 50,
  ]);

describe("the players list", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await adminDb();
    // 25 players with 0 to 4 wins (so many ties), some with a flag.
    for (let index = 0; index < 25; index++) {
      const player = await addPlayer(db, `Player_${String(index).padStart(2, "0")}`, { country: index % 3 === 0 ? "PK" : index % 3 === 1 ? "GB" : null });
      for (let win = 0; win < index % 5; win++) await addWin(db, player, (win % 4) + 1);
      if (index === 7) await addResult(db, player, 3, "loss", { resigned: true });
    }
  }, 120_000);

  it("pages by wins with keyset cursors: every player once, in the full order", async () => {
    const all = await page(db, { sort: "wins", limit: 200 });
    expect(all).toHaveLength(25);
    const seen: PlayerRow[] = [];
    let after: string | null = null;
    let afterId: string | null = null;
    for (let round = 0; round < 10; round++) {
      const next = await page(db, { sort: "wins", after, afterId, limit: 7 });
      if (next.length === 0) break;
      seen.push(...next);
      after = next.at(-1)!.sort_value;
      afterId = next.at(-1)!.id;
    }
    expect(seen.map((row) => row.id)).toEqual(all.map((row) => row.id));
    expect(all[0]!.wins).toBe(4);
    for (let index = 1; index < all.length; index++) expect(all[index]!.wins).toBeLessThanOrEqual(all[index - 1]!.wins);
  });

  it("pages by name and by join date in both directions", async () => {
    for (const sort of ["name", "joined", "active", "games", "resigned", "reports"]) {
      for (const desc of [true, false]) {
        const all = await page(db, { sort, desc, limit: 200 });
        const first = await page(db, { sort, desc, limit: 10 });
        const rest = await page(db, { sort, desc, after: first.at(-1)!.sort_value, afterId: first.at(-1)!.id, limit: 200 });
        expect([...first, ...rest].map((row) => row.id), `${sort} ${desc}`).toEqual(all.map((row) => row.id));
      }
    }
    expect((await page(db, { sort: "name", desc: false, limit: 1 }))[0]!.username).toBe("Player_00");
  });

  it("searches part of a name (with _ as a plain letter), or a whole id", async () => {
    expect((await page(db, { search: "yer_1" })).map((row) => row.username).sort()).toEqual(
      ["Player_10", "Player_11", "Player_12", "Player_13", "Player_14", "Player_15", "Player_16", "Player_17", "Player_18", "Player_19"],
    );
    expect(await page(db, { search: "r_2_" })).toEqual([]);
    const someone = (await page(db, { search: "player_05" }))[0]!;
    expect((await page(db, { search: someone.id.toUpperCase() })).map((row) => row.id)).toEqual([someone.id]);
  });

  it("filters by flag, no flag, level played and status", async () => {
    expect(await page(db, { country: "PK" })).toHaveLength(9);
    expect(await page(db, { country: "none" })).toHaveLength(8);
    // Level 4 wins come with the fourth win: players 4, 9, 14, 19 and 24.
    expect(await page(db, { level: 4 })).toHaveLength(5);
    const target = (await page(db, { search: "player_03" }))[0]!;
    await db.query("select admin_suspend($1, 'ip', $2, now() + interval '2 days', false, 'player.suspend', 'Test')", [ADMIN, target.id]);
    expect((await page(db, { status: "suspended" })).map((row) => row.id)).toEqual([target.id]);
    expect(await page(db, { status: "active" })).toHaveLength(24);
    await db.query("select admin_device_ban($1, 'ip', $2, true, 'Test')", [ADMIN, target.id]);
    expect((await page(db, { status: "device" })).map((row) => row.id)).toEqual([target.id]);
    expect(await errorOf(db, "select * from admin_players(null, null, null, null, null, null, null, null, 'drop', true, null, null, 5)")).toMatch(/unknown sort/);
  });

  it("gives one player's details with an audit row for the look, and the full history in pages", async () => {
    const target = (await page(db, { search: "player_07" }))[0]!;
    const detail = (await one<{ d: Record<string, any> }>(db, "select admin_player_detail($1, 'ip', $2) as d", [ADMIN, target.id])).d;
    expect(detail["player"].username).toBe("Player_07");
    expect(detail["player"].device).toHaveLength(12);
    expect(JSON.stringify(detail)).not.toContain("token ");
    expect(detail["stats"]).toMatchObject({ wins: 2, resigned: 1, games: 3 });
    expect(detail["games"]).toHaveLength(3);
    expect(detail["wins"]).toHaveLength(2);
    expect(await one(db, "select action from admin_audit where target_player = $1 order by id desc limit 1", [target.id])).toEqual({ action: "player.view" });
    const games = await rows<{ created_at: Date; game_id: string }>(db, "select * from admin_player_games($1, null, null, 2)", [target.id]);
    const more = await rows(db, "select * from admin_player_games($1, $2, $3, 2)", [target.id, games[1]!.created_at, games[1]!.game_id]);
    expect(games.length + more.length).toBe(3);
    expect((await one<{ d: unknown }>(db, "select admin_player_detail($1, 'ip', $2) as d", [ADMIN, uuid()])).d).toBeNull();
  });

  it("renames by force (no wait, the old name not kept) unless the name is taken", async () => {
    const target = (await page(db, { search: "player_08" }))[0]!;
    expect((await one<{ r: string }>(db, "select admin_force_rename($1, 'ip', $2, 'Player_09', 'player_09', 'Rude') as r", [ADMIN, target.id])).r).toBe("taken");
    expect((await one<{ r: string }>(db, "select admin_force_rename($1, 'ip', $2, 'Renamed_8', 'renamed_8', 'Rude name') as r", [ADMIN, target.id])).r).toBe("renamed");
    expect(await one(db, "select username, username_changed_at from players where id = $1", [target.id])).toEqual({ username: "Renamed_8", username_changed_at: null });
    expect(await rows(db, "select * from username_reservations where player_id = $1", [target.id])).toEqual([]);
  });
});

describe("the charts, on sample data", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await adminDb();
    const a = await addPlayer(db, "Alpha", { createdAt: "2026-05-04T08:00:00Z", country: "PK" });
    const b = await addPlayer(db, "Bravo", { createdAt: "2026-05-04T22:00:00Z", country: "GB" });
    const c = await addPlayer(db, "Charlie", { createdAt: "2026-05-06T10:00:00Z" });
    await addWin(db, a, 4, { at: "2026-05-04T09:00:00Z", moves: 18 });
    await addWin(db, a, 4, { at: "2026-05-05T09:00:00Z", moves: 25 });
    await addResult(db, a, 4, "loss", { at: "2026-05-05T10:00:00Z", resigned: true });
    await addResult(db, b, 2, "loss", { at: "2026-05-05T11:00:00Z" });
    await addWin(db, b, 4, { at: "2026-05-06T11:00:00Z", moves: 30 });
    await addResult(db, c, 1, "loss", { at: "2026-05-11T11:00:00Z", resigned: true });
    await db.query("insert into player_reports (player_id, game_id, level, phase, created_at) values ($1, $2, 2, 'start', '2026-05-05T11:00:00Z')", [b, uuid()]);
    await db.query("insert into daily_visitors (day, visitors) values ('2026-05-04', 9), ('2026-05-05', 4)");
  }, 120_000);

  type Day = { day: Date; registrations: number; registered: number; visitors: number; active: number; games: number; wins: number; losses: number; resigned: number; abandoned: number };
  it("gives every day of the range, with sign ups, the running total, visitors, active players and games", async () => {
    const days = await rows<Day>(db, "select * from admin_daily('2026-05-03', '2026-05-07')");
    expect(days.map((day) => new Date(day.day).toISOString().slice(0, 10))).toEqual(["2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07"]);
    const pick = (index: number) => {
      const { registrations, registered, visitors, active, games, wins, losses, resigned, abandoned } = days[index]!;
      return [registrations, registered, visitors, active, games, wins, losses, resigned, abandoned].map(Number);
    };
    expect(pick(0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(pick(1)).toEqual([2, 2, 9, 1, 1, 1, 0, 0, 0]);
    expect(pick(2)).toEqual([0, 2, 4, 2, 3, 1, 2, 1, 1]);
    expect(pick(3)).toEqual([1, 3, 0, 1, 1, 1, 0, 0, 0]);
    // A later range starts from the players registered before it.
    expect(Number((await one<Day>(db, "select * from admin_daily('2026-05-06', '2026-05-06')")).registered)).toBe(3);
  });

  it("splits by level, counts weekly active players and ranks flags", async () => {
    const levels = await rows<{ level: number; games: number; wins: number; losses: number }>(db, "select * from admin_daily_levels('2026-05-05', '2026-05-05')");
    expect(levels.map(({ level, games, wins, losses }) => [level, games, wins, losses])).toEqual([
      [2, 1, 0, 1],
      [4, 2, 1, 1],
    ]);
    const weeks = await rows<{ week: Date; active: number }>(db, "select * from admin_weekly_active('2026-05-01', '2026-05-31')");
    expect(weeks.map((week) => [new Date(week.week).toISOString().slice(0, 10), Number(week.active)])).toEqual([
      ["2026-05-04", 2],
      ["2026-05-11", 1],
    ]);
    const flags = await rows<{ country: string; players: number; signups: number; games: number }>(db, "select * from admin_countries(null)");
    expect(flags.map(({ country, players, signups, games }) => [country, Number(players), Number(signups), Number(games)])).toEqual([
      ["PK", 1, 1, 3],
      ["GB", 1, 1, 2],
      ["", 1, 1, 1],
    ]);
  });

  it("gives the real ranking with games for the win rate, the top winners and who resigns most", async () => {
    const ranked = await rows<{ username: string; wins: number; games: number }>(db, "select * from admin_rankings(4, null, 10)");
    expect(ranked.map(({ username, wins, games }) => [username, Number(wins), Number(games)])).toEqual([
      ["Alpha", 2, 3],
      ["Bravo", 1, 1],
    ]);
    const since = await rows<{ username: string }>(db, "select * from admin_rankings(4, '2026-05-06', 10)");
    expect(since.map((row) => row.username)).toEqual(["Bravo"]);
    expect((await rows<{ username: string }>(db, "select * from admin_top_winners(10)")).map((row) => row.username)).toEqual(["Alpha", "Bravo"]);
    const resigners = await rows<{ username: string; resigned: number; abandoned: number }>(db, "select * from admin_resigners(null, 10)");
    expect(resigners.map(({ username, resigned }) => [username, Number(resigned)]).sort()).toEqual([
      ["Alpha", 1],
      ["Charlie", 1],
    ]);
    const lately = await rows<{ username: string }>(db, "select * from admin_resigners('2026-05-10', 10)");
    expect(lately.map((row) => row.username)).toEqual(["Charlie"]);
    const overview = (await one<{ o: Record<string, any> }>(db, "select admin_overview('2026-05-05') as o")).o;
    expect(overview).toMatchObject({ registered: 3, newPlayers: 1, games: 5, resigned: 2, abandoned: 1, visitors: 4 });
    expect(overview["levels"][3]).toMatchObject({ level: 4, games: 3, wins: 2, losses: 1 });
  });
});

describe("the heartbeat and the visitor count", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await adminDb();
  }, 120_000);
  const beat = (session: string, mode = "ai", level: number | null = 3, country: string | null = "PK", limit = 10) =>
    one<{ ok: boolean }>(db, "select presence_beat($1, $2, $3::smallint, $4, 75, $5, $6) as ok", [session, mode, level, country, `beat:${session}`, limit]);
  const live = async () => (await one<{ l: Record<string, any> }>(db, "select admin_live() as l")).l;

  it("counts a device in a game until its row expires, by mode, level and flag", async () => {
    expect((await beat("session-aaaaaaaaaaaa")).ok).toBe(true);
    await beat("session-aaaaaaaaaaaa");
    await beat("session-bbbbbbbbbbbb", "two", null, null);
    expect(await live()).toMatchObject({ online: 2, modes: { ai: 1, two: 1 }, levels: { 3: 1 }, rooms: false });
    expect((await live())["countries"]).toEqual([
      { country: "", n: 1, ai: 0, two: 1, online: 0 },
      { country: "PK", n: 1, ai: 1, two: 0, online: 0 },
    ]);
    await db.query("update live_sessions set expires_at = now() - interval '1 second' where session = 'session-aaaaaaaaaaaa'");
    expect(await live()).toMatchObject({ online: 1 });
    expect(Number((await one<{ n: number }>(db, "select (admin_overview(null) ->> 'onlineNow')::int as n")).n)).toBe(1);
    await db.query("select presence_end('session-bbbbbbbbbbbb')");
    expect(await live()).toMatchObject({ online: 0 });
  });

  it("starts a new game's clock on a new level or after expiry, and refuses beats over the limit", async () => {
    await beat("session-cccccccccccc");
    await db.query("update live_sessions set started_at = now() - interval '5 minutes' where session = 'session-cccccccccccc'");
    await beat("session-cccccccccccc");
    const kept = await one<{ started_at: Date }>(db, "select started_at from live_sessions where session = 'session-cccccccccccc'");
    expect(Date.now() - new Date(kept.started_at).getTime()).toBeGreaterThan(200_000);
    await beat("session-cccccccccccc", "ai", 4);
    const fresh = await one<{ started_at: Date }>(db, "select started_at from live_sessions where session = 'session-cccccccccccc'");
    expect(Date.now() - new Date(fresh.started_at).getTime()).toBeLessThan(60_000);
    for (let index = 0; index < 2; index++) await beat("session-dddddddddddd", "ai", 1, null, 2);
    expect((await beat("session-dddddddddddd", "ai", 1, null, 2)).ok).toBe(false);
    expect(await errorOf(db, "select presence_beat('short', 'ai', 1::smallint, null, 75, 'k', 5)")).toMatch(/check constraint/);
    expect(await errorOf(db, "select presence_beat('session-eeeeeeeeeeee', 'chess', 1::smallint, null, 75, 'k2', 5)")).toMatch(/check constraint/);
  });

  it("counts each device once a day, with marks that are deleted after two days", async () => {
    const visit = (day: string, mark: string) => one<{ ok: boolean }>(db, "select count_visit($1, $2, $3, 100) as ok", [day, mark, `visit:${mark}`]);
    await visit("2026-06-01", "mark-aaaaaaaaaaaaaaaa");
    await visit("2026-06-01", "mark-aaaaaaaaaaaaaaaa");
    await visit("2026-06-01", "mark-bbbbbbbbbbbbbbbb");
    await visit("2026-06-02", "mark-cccccccccccccccc");
    expect(await rows(db, "select day::text, visitors from daily_visitors order by day")).toEqual([
      { day: "2026-06-01", visitors: 2 },
      { day: "2026-06-02", visitors: 1 },
    ]);
    // The clean up runs by chance; run its rule here: marks older than yesterday go.
    await db.query("delete from visitor_marks where day < '2026-06-05'::date - 1");
    expect(await rows(db, "select * from visitor_marks")).toEqual([]);
    expect(await rows(db, "select day::text, visitors from daily_visitors order by day")).toHaveLength(2);
  });
});

describe("reports and unique reporters", () => {
  for (const order of ["before", "after"] as const) {
    it(`counts players' reports from online rooms (migration 6 ${order} 7), the AI as one reporter`, async () => {
      const db = await adminDb(order);
      if (order === "after") {
        expect(await errorOf(db, "select status from online_reports")).toMatch(/does not exist/);
        expect((await one<{ linked: boolean }>(db, "select admin_link_rooms() as linked")).linked).toBe(true);
      }
      const target = await addPlayer(db, "Target");
      const spammer = await addPlayer(db, "Spammer");
      const honest = await addPlayer(db, "Honest");
      const at = new Date().toISOString();
      const codes = ["ABCDEF", "BCDEFG", "CDEFGH"];
      for (const code of codes) {
        await db.query("insert into online_reports (reporter_id, reported_id, room_code, reason, created_at) values ($1, $2, $3, 'spam', $4)", [spammer, target, code, at]);
      }
      await db.query("insert into online_reports (reporter_id, reported_id, room_code, reason, created_at) values ($1, $2, 'DEFGHJ', 'name', $3)", [honest, target, at]);
      await db.query("select * from add_report($1, $2, 2::smallint, 'start', 4, 30)", [target, uuid()]);
      await db.query("select * from add_report($1, $2, 2::smallint, 'start', 4, 30)", [target, uuid()]);

      const listed = await page(db, { search: "target" });
      expect(listed[0]).toMatchObject({ reports: 6, reporters: 3 });
      const groups = await rows<{ username: string; reports: number; reporters: number; open: number }>(db, "select * from admin_report_groups('open', 10)");
      expect(groups.map(({ username, reports, reporters, open }) => [username, Number(reports), Number(reporters), Number(open)])).toEqual([["Target", 6, 3, 6]]);
      expect(await page(db, { status: "reported" })).toHaveLength(1);

      const reports = await rows<{ source: string; key: string; reporter: string }>(db, "select * from admin_reports(null, null, $1, null, null, 50)", [target]);
      expect(reports).toHaveLength(6);
      expect(reports.filter((report) => report.source === "ai").every((report) => report.reporter === "AI")).toBe(true);
      const first = await rows<{ created_at: Date; key: string }>(db, "select * from admin_reports(null, null, $1, null, null, 4)", [target]);
      const rest = await rows(db, "select * from admin_reports(null, null, $1, $2, $3, 50)", [target, first[3]!.created_at, first[3]!.key]);
      expect(first.length + rest.length).toBe(6);

      const spam = reports.find((report) => report.source === "room" && report.reporter === "Spammer")!;
      expect((await one<{ ok: boolean }>(db, "select admin_set_report_status($1, 'ip', 'room', $2, 'dismissed', 'Same person three times') as ok", [ADMIN, spam.key])).ok).toBe(true);
      const ai = reports.find((report) => report.source === "ai")!;
      expect((await one<{ ok: boolean }>(db, "select admin_set_report_status($1, 'ip', 'ai', $2, 'reviewed', null) as ok", [ADMIN, ai.key])).ok).toBe(true);
      expect(await rows(db, "select * from admin_reports('dismissed', null, null, null, null, 50)")).toHaveLength(1);
      expect(Number((await one<{ open: number }>(db, "select open from admin_report_groups(null, 10)")).open)).toBe(4);
      expect(Number((await one<{ n: number }>(db, "select (admin_overview(null) ->> 'openReports')::int as n")).n)).toBe(4);
      expect(await rows(db, "select action from admin_audit where action like 'report.%' order by id")).toEqual([{ action: "report.dismissed" }, { action: "report.reviewed" }]);

      const detail = (await one<{ d: Record<string, any> }>(db, "select admin_player_detail($1, 'ip', $2) as d", [ADMIN, target])).d;
      expect(detail["reportsAgainst"]).toHaveLength(6);
      const made = (await one<{ d: Record<string, any> }>(db, "select admin_player_detail($1, 'ip', $2) as d", [ADMIN, spammer])).d;
      expect(made["reportsMade"]).toHaveLength(3);
    }, 120_000);
  }

  it("shows room games in progress without their moves, and replays only finished or reported ones", async () => {
    const db = await adminDb("before");
    const host = await addPlayer(db, "Host", { country: "PK" });
    const guest = await addPlayer(db, "Guest", { country: "GB" });
    const room = uuid();
    const now = new Date().toISOString();
    await db.query("insert into online_rooms (id, code, host_id, device_hash, created_at, used_at) values ($1, 'HJKMNP', $2, 'room-device', $3, $3)", [room, host, now]);
    const match = uuid();
    await db.query("insert into online_matches (id, room_id, number, black_id, white_id, moves, move_count, starts_at) values ($1, $2, 1, $3, $4, '[[21, 30]]', 1, $5)", [match, room, host, guest, now]);
    const live = (await one<{ l: Record<string, any> }>(db, "select admin_live() as l")).l;
    expect(live["rooms"]).toBe(true);
    expect(live["roomGames"]).toHaveLength(1);
    expect(live["roomGames"][0]).toMatchObject({ move_count: 1, black: { username: "Host", country: "PK" }, white: { username: "Guest" } });
    expect(JSON.stringify(live)).not.toContain("[21");
    expect((await one<{ r: unknown }>(db, "select admin_replay($1, 'ip', 'match', $2) as r", [ADMIN, match])).r).toBeNull();
    await db.query("insert into online_reports (reporter_id, reported_id, room_code, reason, created_at) values ($1, $2, 'HJKMNP', 'stalling', $3)", [guest, host, now]);
    expect((await one<{ r: Record<string, any> }>(db, "select admin_replay($1, 'ip', 'match', $2) as r", [ADMIN, match])).r).toMatchObject({ kind: "match", moveCount: 1, black: "Host" });
    // A finished game adds one online game to its day.
    await db.query("update online_matches set finished = true, reason = 'resign', winner_id = $2, finished_at = now() where id = $1", [match, guest]);
    expect(Number((await one<{ n: number }>(db, "select (admin_overview(null) ->> 'onlineGames')::int as n")).n)).toBe(1);
    const win = await addWin(db, host, 2);
    expect((await one<{ r: Record<string, any> }>(db, "select admin_replay($1, 'ip', 'win', $2) as r", [ADMIN, win])).r).toMatchObject({ kind: "win", player: "Host" });
    expect(await rows(db, "select action from admin_audit where action = 'game.replay'")).toHaveLength(2);
  }, 120_000);
});
