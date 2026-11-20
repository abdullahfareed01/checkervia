// The admin page is its own build (D100): this builds the game and the admin
// the way Netlify does (npm run build), into one temporary folder, and
// checks that nothing a player downloads holds admin code or links to
// /admin, and that the admin page itself is closed off: never indexed, a
// strict Content Security Policy, no inline script or style, no Supabase
// client or server secret, and no development demo.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";

const outDir = mkdtempSync(join(tmpdir(), "admin-build-"));
let gameHtml = "";
let gameCode = "";
let gameFiles: string[] = [];
let adminHtml = "";
let adminCode = "";
let adminCss = "";

const read = (path: string) => readFileSync(path, "utf8");

beforeAll(async () => {
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build({ root: process.cwd(), mode: "production", logLevel: "silent", build: { outDir, emptyOutDir: true } });
    await build({ root: process.cwd(), configFile: "vite.admin.config.ts", mode: "production", logLevel: "silent", build: { outDir, emptyOutDir: false } });
  } finally {
    process.env.NODE_ENV = nodeEnv;
  }
  gameHtml = read(join(outDir, "index.html"));
  gameFiles = readdirSync(join(outDir, "assets"));
  gameCode = gameFiles.filter((file) => /\.(js|css)$/.test(file)).map((file) => read(join(outDir, "assets", file))).join("\n");
  adminHtml = read(join(outDir, "admin", "index.html"));
  const adminFiles = readdirSync(join(outDir, "admin", "assets"));
  adminCode = adminFiles.filter((file) => file.endsWith(".js")).map((file) => read(join(outDir, "admin", "assets", file))).join("\n");
  adminCss = adminFiles.filter((file) => file.endsWith(".css")).map((file) => read(join(outDir, "admin", "assets", file))).join("\n");
}, 240_000);

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

// Words that only admin code holds.
const ADMIN_MARKERS = ["admin-auth", "admin-api", "x-checkervia-admin", "Checkervia admin", "adm-auth", "adm-side", "Authenticator code", "admin_players", "ADMIN_EMAIL"];

describe("the game's files", () => {
  it("hold no admin code and never link to /admin", () => {
    expect(gameCode.length).toBeGreaterThan(10_000);
    for (const marker of ADMIN_MARKERS) expect(gameCode, marker).not.toContain(marker);
    expect(gameHtml).not.toContain("/admin");
    expect(gameCode).not.toMatch(/["'`]\/admin/);
    expect(gameFiles.some((file) => /admin/i.test(file))).toBe(false);
  });

  it("load only files from the game's own folder", () => {
    const sources = [...gameHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]!);
    expect(sources.filter((source) => source.startsWith("/admin"))).toEqual([]);
  });
});

describe("the admin page", () => {
  it("is never indexed and has a strict Content Security Policy", () => {
    expect(adminHtml).toContain('<meta name="robots" content="noindex, nofollow, noarchive" />');
    const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(adminHtml)?.[1] ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("style-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain("unsafe");
    expect(adminHtml.indexOf("Content-Security-Policy")).toBeGreaterThan(adminHtml.indexOf("charset"));
  });

  it("has no inline script or style (the policy would block them)", () => {
    expect(adminHtml).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(adminHtml).not.toMatch(/<style/);
    expect(adminHtml).not.toMatch(/\son[a-z]+=/);
    expect(adminCss).not.toMatch(/url\(\s*["']?data:/);
  });

  it("talks only to our functions: no Supabase client, no server setting, no demo", () => {
    expect(adminCode).toContain("admin-auth");
    expect(adminCode).not.toMatch(/supabase/i);
    for (const secret of ["SERVICE_ROLE", "LEADERBOARD_HASH_SALT", "SUPABASE_ANON_KEY", "ADMIN_EMAIL"]) expect(adminCode).not.toContain(secret);
    expect(adminCode).not.toContain("demo.token.value");
    expect(adminCode).not.toContain("startDemo");
    // The access token is kept in memory, never in the browser's storage.
    // D112: the one exception is the theme choice (src/admin/theme.ts),
    // its read, save and remove; nothing else may use storage at all.
    expect(adminCode).not.toMatch(/sessionStorage|indexedDB/);
    expect(adminCode.match(/localStorage/g)?.length ?? 0).toBeLessThanOrEqual(3);
    expect(adminCode).toContain("checkervia-admin-theme");
  });
  it("uses storage only for the theme choice, with one fixed key and value set (D112)", () => {
    const files = readdirSync("src/admin", { recursive: true }).map((file) => join("src/admin", String(file))).filter((file) => /\.(ts|tsx)$/.test(file));
    const users = files.filter((file) => /localStorage|sessionStorage|indexedDB|document\.cookie/.test(readFileSync(file, "utf8")));
    expect(users.map((file) => file.replace(/\\/g, "/"))).toEqual(["src/admin/theme.ts"]);
    const theme = readFileSync("src/admin/theme.ts", "utf8");
    expect(theme.match(/localStorage\?\.(\w+)\(([^)]*)\)/g)).toEqual(["localStorage?.getItem(KEY)", "localStorage?.removeItem(KEY)", "localStorage?.setItem(KEY, choice)"]);
    expect(theme).toContain('const KEY = "checkervia-admin-theme";');
    expect(theme).toMatch(/if \(choice === "system"\) globalThis\.localStorage\?\.removeItem\(KEY\);\s*else globalThis\.localStorage\?\.setItem\(KEY, choice\);/);
  });
});

describe("netlify.toml", () => {
  const toml = read(join(process.cwd(), "netlify.toml"));
  const build = /command = "([^"]+)"/.exec(toml)?.[1];
  it("builds the admin page and opens it at /admin, with closed off headers", () => {
    expect(build).toBe("npm run build");
    expect(JSON.parse(read(join(process.cwd(), "package.json"))).scripts.build).toContain("vite build --config vite.admin.config.ts");
    expect(toml).toMatch(/from = "\/admin\/\*"\s+to = "\/admin\/index.html"\s+status = 200/);
    for (const header of ["X-Robots-Tag = \"noindex", "frame-ancestors 'none'", "X-Frame-Options = \"DENY\"", "Referrer-Policy = \"no-referrer\"", "Cache-Control = \"no-store\""]) {
      expect(toml).toContain(header);
    }
  });
});
