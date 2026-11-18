// Migration 7 (the admin dashboard, D101) in PGlite: a database like a new
// Supabase project (its three API roles, their default grants, the auth
// schema's users table and the extensions schema), with migrations 1 to 4
// and then 7. With `rooms`, migration 6's tables are made before or after 7
// (the real file once it is in this branch, else the stand-in copy).
import { existsSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const docs = (name: string) => new URL(`../../docs/07-deployment/${name}`, import.meta.url);
export const migrationSql = (name: string) => readFileSync(docs(name), "utf8");

export const SUPABASE_LIKE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create schema extensions;
`;

function roomsSql(): string {
  const real = docs("leaderboard-migration-6.sql");
  return existsSync(real) ? readFileSync(real, "utf8") : readFileSync(new URL("./rooms-stand-in.sql", import.meta.url), "utf8");
}

export async function adminDb(rooms: "none" | "before" | "after" = "none"): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_LIKE);
  for (const name of ["leaderboard-migration.sql", "leaderboard-migration-2.sql", "leaderboard-migration-3.sql", "leaderboard-migration-4.sql"]) {
    await db.exec(migrationSql(name));
  }
  if (rooms === "before") await db.exec(roomsSql());
  await db.exec(migrationSql("leaderboard-migration-7.sql"));
  if (rooms === "after") await db.exec(roomsSql());
  return db;
}

let next = 0;
/** A fresh version 4 UUID, in order, so tests can predict the id order. */
export const uuid = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;

export async function addPlayer(db: PGlite, username: string, options: { country?: string | null; createdAt?: string; device?: string } = {}): Promise<string> {
  const id = uuid();
  await db.query(
    `insert into players (id, username, username_key, token_hash, device_hash, ip_hash, country, created_at)
     values ($1, $2::text, lower($2::text), $3, $4, 'ip-hash', $5, coalesce($6::timestamptz, now()))`,
    [id, username, `token ${id}`, options.device ?? `device-hash-${id}`, options.country ?? null, options.createdAt ?? null],
  );
  return id;
}

export async function addResult(db: PGlite, player: string, level: number, result: "win" | "loss", options: { resigned?: boolean; at?: string; game?: string } = {}): Promise<string> {
  const game = options.game ?? uuid();
  await db.query("insert into game_results (player_id, game_id, level, result, resigned, created_at) values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()))", [
    player,
    game,
    level,
    result,
    options.resigned ?? false,
    options.at ?? null,
  ]);
  return game;
}

/** A verified win, as submit-win writes it: the win and its result. */
export async function addWin(db: PGlite, player: string, level: number, options: { at?: string; moves?: number } = {}): Promise<string> {
  const game = uuid();
  const win = uuid();
  await db.query(
    "insert into wins (id, player_id, game_id, level, moves, moves_hash, move_count, stats, created_at) values ($1, $2, $3, $4, '[[21, 30]]', $5, $6, '{}', coalesce($7::timestamptz, now()))",
    [win, player, game, level, `hash ${win}`, options.moves ?? 20, options.at ?? null],
  );
  await addResult(db, player, level, "win", { at: options.at, game });
  return win;
}

/** The error message of a statement, or "no error". Run in a transaction that is rolled back, so it changes nothing. */
export async function errorOf(db: PGlite, sql: string, params: unknown[] = []): Promise<string> {
  await db.exec("begin");
  try {
    if (params.length > 0) await db.query(sql, params);
    else await db.exec(sql);
    return "no error";
  } catch (error) {
    return String((error as Error).message);
  } finally {
    await db.exec("rollback");
  }
}

/** Runs SQL as one of the API roles, then goes back to the test's own role. */
export async function errorAs(db: PGlite, role: "anon" | "authenticated" | "service_role", sql: string): Promise<string> {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}; ${sql}`);
    return "no error";
  } catch (error) {
    return String((error as Error).message);
  } finally {
    await db.exec("rollback");
  }
}

export async function one<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0]!;
}

export async function rows<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
