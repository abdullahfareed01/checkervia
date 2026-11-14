// Profile first and automatic wins (D61), avatars (D62): the first game's
// order (consent, then profile, then board), the board hidden until the
// profile is saved, the offline first game, two players never asked, the
// automatic submit with its queue and safe retries, the custom country
// picker's keys and roles, no automatic country anywhere, and the avatars.
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AVATAR_IDS } from "../../src/leaderboard/avatars";
import { COUNTRY_NAMES } from "../../src/leaderboard/countries";
import { setLeaderboardTransport } from "../../src/ui/leaderboard/api";
import { AVATAR_CATEGORIES, avatarsIn } from "../../src/ui/leaderboard/Avatar";
import avatarList from "../../src/ui/leaderboard/avatarList.json";
import { CountryPicker, NO_FLAG_LABEL, choiceLabel, matchCountries, opensOnKey, searchKeyAction } from "../../src/ui/leaderboard/CountryPicker";
import { gateStep } from "../../src/ui/leaderboard/ProfileGate";
import { BROWSER_NOTICE, PUBLIC_NOTICE, ProfileScreen, renameDateText, saveProblemText } from "../../src/ui/leaderboard/ProfileScreen";
import { QUEUE_KEY, QUEUE_MAX_AGE_MS, leaderboardStore } from "../../src/ui/leaderboard/profile";
import { OFFLINE_TEXT } from "../../src/ui/leaderboard/Problem";
import { WinStatus } from "../../src/ui/leaderboard/WinStatus";
import { addedText, flushQueue, outcomeOf, sendWin, startQueueRetries } from "../../src/ui/leaderboard/winQueue";
import { Root } from "../../src/ui/Root";
import { BLACK_WIN } from "./fixtures";

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  });
  leaderboardStore.reload();
});
afterEach(() => setLeaderboardTransport(null));

const TOKEN = "B".repeat(43);
const PROFILE = { username: "Fan_One", country: "PK", avatar: "a07", token: TOKEN };
const noop = () => {};
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const gameId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Answers each request in turn with the next status and body; records what was sent.
function answers(...replies: [number, unknown][]) {
  const sent: unknown[] = [];
  setLeaderboardTransport(async (_input, init) => {
    sent.push(JSON.parse(String(init?.body ?? "null")));
    const [status, body] = replies[Math.min(sent.length - 1, replies.length - 1)]!;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return sent;
}

describe("the first game against the AI", () => {
  it("asks for a profile online, shows a notice offline, and never for two players or with a profile", () => {
    expect(gateStep("vs-ai", false, true)).toBe("profile");
    expect(gateStep("vs-ai", false, false)).toBe("offline");
    expect(gateStep("vs-ai", true, true)).toBe("board");
    expect(gateStep("vs-ai", true, false)).toBe("board");
    expect(gateStep("two-player", false, true)).toBe("board");
    expect(gateStep("two-player", false, false)).toBe("board");
  });

  it("comes after the consent steps and before the board, from the home screen and inside a game", () => {
    const root = source("src/ui/Root.tsx");
    // The consent gate starts the game through the profile gate.
    expect(root).toMatch(/useStrongestGate\(gatedStart\)/);
    expect(root).toMatch(/const gatedStart = useCallback\(\(level: AiLevel\) => requireProfile\(\(\) => startAt\(level\)\)/);
    // Two players start at once.
    expect(root).toMatch(/mode === "vs-ai" \? setAskLevel\(true\) : start\(mode\)/);
    const app = source("src/ui/App.tsx");
    expect(app).toMatch(/useStrongestGate\(startAt\)/);
    expect(app).toMatch(/requireProfile\(\(\) => \{\s*playAi\(level\);/);
    // New game and Play again for a game against the AI pass the gate too.
    expect(app).toMatch(/if \(current\.current\.mode === "vs-ai"\) requireProfile\(startNewGame\);\s*else startNewGame\(\);/);
  });

  it("keeps the board hidden until the profile is saved, and shows it at once with a profile", () => {
    const record = { mode: "vs-ai" as const, aiLevel: 4 as const, record: [] };
    const without = renderToStaticMarkup(createElement(Root, { initial: record, checkAi: () => new Promise<"ready">(() => {}) }));
    expect(without).not.toMatch(/aria-label="Row /);
    leaderboardStore.setProfile(PROFILE);
    const withProfile = renderToStaticMarkup(createElement(Root, { initial: record, checkAi: () => new Promise<"ready">(() => {}) }));
    expect(withProfile).toMatch(/aria-label="Row /);
  });

  it("the profile screen: no Skip, Back to home, nothing chosen, the public line and a required I understand", () => {
    const html = renderToStaticMarkup(createElement(ProfileScreen, { firstGame: true, onClose: noop, onTerms: noop }));
    expect(html).not.toMatch(/Skip/i);
    expect(html).toContain('aria-label="Back to the home screen"');
    expect(html).toContain(">Back</button>");
    expect(html).toContain(PUBLIC_NOTICE);
    expect(html).toMatch(/<input type="checkbox" required=""/);
    expect(html).toContain(">I understand<");
    expect(html).toContain(BROWSER_NOTICE);
    expect(html).toContain(">Choose a country<");
    expect(html).toMatch(/<button type="submit" class="lb-button lb-button-gold" aria-busy="false" disabled="">Save<\/button>/);
    expect(html).toContain("Your wins are then added automatically.");
    expect(PUBLIC_NOTICE).toBe("Your username, flag and wins are public on the leaderboard.");
  });

  it("with a profile the same screen edits it: username, avatar and flag, with the rename rules", () => {
    leaderboardStore.setProfile(PROFILE);
    const html = renderToStaticMarkup(createElement(ProfileScreen, { onClose: noop, onTerms: noop }));
    expect(html).toContain("Edit your profile");
    expect(html).toContain('value="Fan_One"');
    expect(html).toContain("once every 7 days");
    expect(html).toContain("reserved for you for 30 days");
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain(">Pakistan<");
    expect(html).toMatch(/disabled=""[^>]*>Save changes<\/button>/);
  });

  it("says when the next rename is allowed, and uses the three shared messages for problems", () => {
    expect(renameDateText("2026-11-21T09:00:00.000Z")).toBe("Saturday 21 November");
    expect(saveProblemText({ kind: "failed", status: 409, code: "renameTooSoon", nextRenameAt: "2026-11-21T09:00:00.000Z" })).toBe(
      "You can change your username again on Saturday 21 November.",
    );
    expect(saveProblemText({ kind: "failed", status: 409, code: "taken" })).toBe("This username is taken. Please choose another.");
    expect(saveProblemText({ kind: "offline" })).toBe(OFFLINE_TEXT);
    expect(saveProblemText({ kind: "failed", status: 429, code: "rateLimited", retryAfter: 20 })).toBe("Too many requests. Try again in 20 seconds.");
  });
});

describe("automatic wins and the queue", () => {
  const win = (n: number, queuedAt?: number) => ({ gameId: gameId(n), level: 4 as const, moves: BLACK_WIN, ...(queuedAt === undefined ? {} : { queuedAt }) });

  it("keeps each game once, survives a reload, and drops wins older than seven days", () => {
    let now = Date.parse("2026-11-18T12:00:00Z");
    leaderboardStore.reload(() => now);
    leaderboardStore.enqueue(win(1));
    leaderboardStore.enqueue(win(1));
    leaderboardStore.enqueue(win(2));
    expect(leaderboardStore.get().queue.map((queued) => queued.gameId)).toEqual([gameId(1), gameId(2)]);
    expect(JSON.parse(storage.get(QUEUE_KEY)!)).toHaveLength(2);
    now += QUEUE_MAX_AGE_MS + 1;
    leaderboardStore.reload(() => now);
    expect(leaderboardStore.get().queue).toEqual([]);
  });

  it("an accepted win leaves the queue and says the rank this week", async () => {
    leaderboardStore.setProfile(PROFILE);
    leaderboardStore.enqueue(win(3));
    const sent = answers([201, { moveCount: 20, weekRank: 12 }]);
    const status = await sendWin(leaderboardStore.get().queue[0]!);
    expect(sent).toEqual([{ gameId: gameId(3), level: 4, mode: "vs-ai", moves: BLACK_WIN }]);
    expect(status).toEqual({ kind: "added", rank: 12, level: 4 });
    expect(addedText(status as Extract<typeof status, { kind: "added" }>)).toBe("Added. You are number 12 this week on Strongest.");
    expect(leaderboardStore.get().queue).toEqual([]);
  });

  it("retries are safe: a win the server already has counts as added and leaves the queue", async () => {
    leaderboardStore.setProfile(PROFILE);
    leaderboardStore.enqueue(win(4));
    answers([409, { error: "x", code: "duplicate" }]);
    expect(await sendWin(leaderboardStore.get().queue[0]!)).toEqual({ kind: "added", rank: null, level: 4 });
    expect(leaderboardStore.get().queue).toEqual([]);
  });

  it("offline, a server problem or too many requests keep the win for later; a refused game does not", () => {
    const level = 4 as const;
    expect(outcomeOf({ kind: "offline" }, level)).toEqual({ status: { kind: "problem", problem: { kind: "offline" } }, keep: true });
    expect(outcomeOf({ kind: "serverError", status: 503 }, level)).toEqual({ status: { kind: "problem", problem: { kind: "server" } }, keep: true });
    expect(outcomeOf({ kind: "failed", status: 429, code: "rateLimited", retryAfter: 9 }, level)).toEqual({ status: { kind: "problem", problem: { kind: "limited", retryAfter: 9 } }, keep: true });
    expect(outcomeOf({ kind: "failed", status: 422, code: "illegal" }, level).keep).toBe(false);
    expect(outcomeOf({ kind: "failed", status: 401, code: "noProfile" }, level).keep).toBe(false);
  });

  it("the queue is sent in order when the app opens and again when the device is back online", async () => {
    leaderboardStore.setProfile(PROFILE);
    leaderboardStore.enqueue(win(5));
    leaderboardStore.enqueue(win(6));
    const sent = answers([503, { error: "x", code: "unavailable" }]);
    const events = new EventTarget();
    Object.assign(globalThis, { window: events });
    const stop = startQueueRetries();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The first problem stops the round; both wins stay.
    expect(sent.map((body) => (body as { gameId: string }).gameId)).toEqual([gameId(5)]);
    expect(leaderboardStore.get().queue).toHaveLength(2);

    answers([201, { moveCount: 20, weekRank: 3 }]);
    events.dispatchEvent(new Event("online"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushQueue();
    expect(leaderboardStore.get().queue).toEqual([]);
    stop();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("without a profile nothing is sent", async () => {
    leaderboardStore.enqueue(win(7));
    const sent = answers([201, {}]);
    await flushQueue();
    expect(sent).toEqual([]);
  });

  it("the result panel adds the win by itself: a status line, no button to add it", () => {
    leaderboardStore.setProfile(PROFILE);
    const html = renderToStaticMarkup(createElement(WinStatus, { win: win(8) }));
    expect(html).toContain("Adding your win…");
    expect(html).not.toMatch(/Add win|Skip|Save/);
    expect(html).toContain('src="/avatars/a07.svg"');
    // The old Menu item and Settings form are gone.
    expect(source("src/ui/App.tsx")).not.toContain("Add your last win");
    expect(source("src/ui/SettingsSheet.tsx")).not.toContain("SubmitWin");
  });
});

describe("the country picker", () => {
  it("starts with nothing chosen, offers no flag first, then every country", () => {
    expect(choiceLabel(null)).toBe("Choose a country");
    expect(choiceLabel("none")).toBe(NO_FLAG_LABEL);
    expect(choiceLabel("PK")).toBe("Pakistan");
    const all = matchCountries("");
    expect(all[0]).toEqual({ value: "none", name: "Prefer not to show a flag" });
    expect(all).toHaveLength(Object.keys(COUNTRY_NAMES).length + 1);
  });

  it("searches by name start, then inside names, ignoring accents and case, and by code", () => {
    expect(matchCountries("pak")[0]?.value).toBe("PK");
    expect(matchCountries("ALAND")[0]?.value).toBe("AX");
    expect(matchCountries("gb")[0]?.value).toBe("GB");
    expect(matchCountries("kingdom").map((option) => option.value)).toContain("GB");
    expect(matchCountries("zzzz")).toEqual([]);
  });

  it("moves with the arrow keys, Page keys, Home and End, chooses with Enter, closes with Escape and Tab", () => {
    expect(searchKeyAction("ArrowDown", 0, 10, "")).toEqual({ kind: "move", index: 1 });
    expect(searchKeyAction("ArrowDown", 9, 10, "")).toEqual({ kind: "move", index: 9 });
    expect(searchKeyAction("ArrowUp", 0, 10, "")).toEqual({ kind: "move", index: 0 });
    expect(searchKeyAction("PageDown", 5, 10, "")).toEqual({ kind: "move", index: 9 });
    expect(searchKeyAction("End", 2, 10, "")).toEqual({ kind: "move", index: 9 });
    expect(searchKeyAction("Home", 2, 10, "pa")).toBeNull(); // the text cursor moves instead
    expect(searchKeyAction("Enter", 3, 10, "")).toEqual({ kind: "choose" });
    expect(searchKeyAction("Enter", 0, 0, "zz")).toBeNull();
    expect(searchKeyAction("Escape", 3, 10, "")).toEqual({ kind: "close", focusButton: true });
    expect(searchKeyAction("Tab", 3, 10, "")).toEqual({ kind: "close", focusButton: false });
    expect(searchKeyAction("p", 3, 10, "")).toBeNull();
    expect(opensOnKey("ArrowDown", false)).toBe("open");
    expect(opensOnKey("p", false)).toBe("search");
    expect(opensOnKey("p", true)).toBeNull();
    expect(opensOnKey(" ", false)).toBeNull();
  });

  it("is a labelled button, and open a combobox over a listbox with the chosen option marked", () => {
    const closed = renderToStaticMarkup(createElement(CountryPicker, { value: null, onChange: noop }));
    expect(closed).toMatch(/<button type="button" class="cp-button cp-button-empty" aria-haspopup="listbox" aria-expanded="false"/);
    expect(closed).not.toContain("<select");
    const open = renderToStaticMarkup(createElement(CountryPicker, { value: "PK", onChange: noop, initiallyOpen: true }));
    expect(open).toMatch(/role="combobox"[^>]*aria-expanded="true"[^>]*aria-controls="[^"]+-list"/);
    expect(open).toContain('aria-activedescendant="');
    expect(open).toMatch(/role="listbox" aria-label="Country"/);
    expect(open.match(/role="option"/g)).toHaveLength(Object.keys(COUNTRY_NAMES).length + 1);
    expect(open.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(open).toMatch(/aria-selected="true" class="cp-option[^"]* cp-option-selected"/);
  });
});

describe("no automatic country is left", () => {
  it("the server never reads a geo header and the client never asks for one", () => {
    expect(source("netlify/leaderboard/netlify.ts")).not.toMatch(/geo/i);
    expect(source("netlify/leaderboard/http.ts")).not.toMatch(/geo|"auto"/i);
    for (const file of ["api.ts", "ProfileScreen.tsx", "CountryPicker.tsx", "devServer.ts"]) {
      expect(source(`src/ui/leaderboard/${file}`)).not.toMatch(/"auto"|geoCountry|Automatic/);
    }
  });
});

describe("the avatars", () => {
  it("every allowed id has one drawing, in exactly one category, at least 8 in each", () => {
    const list = avatarList as { id: string; category: string }[];
    expect(list.map((avatar) => avatar.id).sort()).toEqual([...AVATAR_IDS].sort());
    for (const category of AVATAR_CATEGORIES) expect(avatarsIn(category.id).length).toBeGreaterThanOrEqual(8);
    expect(AVATAR_CATEGORIES.map((category) => category.label)).toEqual(["Male", "Female", "Kid", "Older adult"]);
    for (const id of AVATAR_IDS) {
      const file = new URL(`../../public/avatars/${id}.svg`, import.meta.url);
      expect(existsSync(file)).toBe(true);
      const svg = readFileSync(file, "utf8");
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 128 128">/);
      expect(svg).not.toMatch(/<script|href=|<image/); // drawn shapes only, nothing loaded
      expect(svg.length).toBeLessThan(4000);
    }
  });

  it("the ids say nothing about the category, and the server never sees a category", () => {
    const first = (avatarList as { id: string; category: string }[]).slice(0, 8).map((avatar) => avatar.category);
    expect(new Set(first).size).toBeGreaterThan(1);
    for (const file of ["handlers/claimUsername.ts", "handlers/updateProfile.ts", "store.ts", "supabaseStore.ts", "memoryStore.ts"]) {
      expect(source(`netlify/leaderboard/${file}`)).not.toMatch(/avatarList|category|gender/i);
    }
    const statements = source("docs/07-deployment/leaderboard-migration-2.sql").replace(/--.*$/gm, "");
    expect(statements).not.toMatch(/gender|category/i);
  });
});
