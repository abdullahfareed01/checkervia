// The development only URL options (?scenario= prepared positions, ?idle=fast
// quick idle lines, ?sounds the sound audition page) must do nothing in a production build: their code is
// behind import.meta.env.DEV, so Vite leaves it out. This builds the app the
// way Netlify does (into a temporary folder) and checks that none of it is in
// the output.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";

const outDir = mkdtempSync(join(tmpdir(), "draft-build-"));
let code = "";
let files: string[] = [];

// A string literal in any quote style (the minifier writes `x`).
const literal = (text: string) => new RegExp(`["'\`]${text}["'\`]`);

beforeAll(async () => {
  // Vitest runs with NODE_ENV=test, which would make Vite build in
  // development mode (import.meta.env.DEV true); Netlify builds with
  // production, so the test does too.
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build({ root: process.cwd(), mode: "production", logLevel: "silent", build: { outDir, emptyOutDir: true } });
  } finally {
    process.env.NODE_ENV = nodeEnv;
  }
  files = readdirSync(join(outDir, "assets"));
  code = files.filter((file) => file.endsWith(".js")).map((file) => readFileSync(join(outDir, "assets", file), "utf8")).join("\n");
}, 120_000);

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe("production build", () => {
  it("has no ?scenario= option: no scenario lookup and no prepared positions", () => {
    expect(code.length).toBeGreaterThan(10_000);
    expect(files.some((file) => /devScenarios/i.test(file))).toBe(false);
    expect(code).not.toMatch(literal("scenario"));
    expect(code).not.toContain("react-strong");
  });

  it("has no ?idle=fast option", () => {
    expect(code).not.toMatch(literal("fast"));
  });

  it("has no ?sounds audition page", () => {
    expect(files.some((file) => /SoundAudition/i.test(file))).toBe(false);
    expect(code).not.toMatch(literal("sounds"));
    expect(code).not.toContain("Sound audition");
  });

  it("ships no audio files (every sound is synthesized)", () => {
    expect(files.filter((file) => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file))).toEqual([]);
  });

  // The Supabase client and its service role key belong to the Netlify
  // functions only (D56).
  it("has no Supabase client, no leaderboard server code and no service key name", () => {
    expect(code).not.toMatch(/supabase/i);
    expect(code).not.toContain("SERVICE_ROLE");
    expect(code).not.toContain("LEADERBOARD_HASH_SALT");
    expect(code).not.toContain("hit_rate_limit");
  });
});
