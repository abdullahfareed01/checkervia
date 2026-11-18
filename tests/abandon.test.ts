// D85: abandoned games, the AI's reports and the 30 day suspension, in the
// browser. A game against the AI left without a move for a minute (any tap
// on the board starts the minute again) is abandoned: the AI says an angry
// last line, the game ends as the player's loss, and a small popup follows.
// Every abandoned game is one report; the fourth suspends the account for
// 30 days and the count starts again; a suspended account cannot start a
// game against the AI and is told so, with the email address.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEVELS } from "../src/ai/difficulty";
import { LINE_BANKS } from "../src/ai/lines";
import { CONTACT_EMAIL, REPORT_LIMIT, SUSPENSION_DAYS } from "../src/leaderboard/protocol";
import type { ProfileResponse } from "../src/leaderboard/protocol";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction } from "../src/state/gameReducer";
import { ABANDON_AFTER_MS, createAbandonTimer } from "../src/ui/abandonTimer";
import { aiMood } from "../src/ui/aiMood";
import { AbandonDialog, SuspendedDialog, longDate, reportsLeftText } from "../src/ui/ConductDialogs";
import { CONDUCT_KEY, EMPTY_CONDUCT, abandonPhaseOf, conductStore, isSuspended, parseConduct, sendPendingReports, shownConduct, syncConduct, withReport, withServer } from "../src/ui/conduct";
import type { Conduct, PendingReport } from "../src/ui/conduct";
import { winReasonOf } from "../src/ui/gameView";
import { leaderboardStore } from "../src/ui/leaderboard/profile";
import { ProfileStats } from "../src/ui/leaderboard/ProfileSheet";
import { reportedResult } from "../src/ui/leaderboard/useLeaderboardGame";
import { endContext, isSubmittableWin, vsAiOutcomeOf } from "../src/ui/usePersonality";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-18T12:00:00Z");
const click = (row: number, col: number): GameAction => ({ type: "click", position: { row, col } });
const id = (n: number) => `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`;
const report = (n: number, phase: "start" | "middle" = "middle"): PendingReport => ({ gameId: id(n), level: 3, phase });
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("an abandoned game", () => {
  const playing = [click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai" }));
  const afterAi = gameReducer(playing, { type: "aiMoved", requestId: playing.aiRequestId, move: playing.legalMoves[0]! });

  it("ends as the player's loss, like a resignation, marked abandoned; never a leaderboard win", () => {
    const abandoned = gameReducer(afterAi, { type: "abandon" });
    expect(abandoned).toMatchObject({ abandoned: true, resignedBy: "black", winner: "white", legalMoves: [], aiPhase: "idle" });
    expect(endContext(abandoned)).toBe("abandoned");
    expect(isSubmittableWin(abandoned)).toBe(false);
    expect(winReasonOf(abandoned)).toBe("Game abandoned: you did not move.");
    expect(aiMood(abandoned)).toBe("angry");
    // As White too: Black (the AI) wins.
    const white = createGameState({ mode: "vs-ai", humanSide: "white" });
    expect(gameReducer(white, { type: "abandon" })).toMatchObject({ abandoned: true, resignedBy: "white", winner: "black" });
  });

  it("counts as a plain loss, never as a resignation, for the server and for this device", () => {
    const abandoned = gameReducer(afterAi, { type: "abandon" });
    const resigned = gameReducer(afterAi, { type: "resign" });
    expect(reportedResult(abandoned)).toEqual({ result: "loss", resigned: false });
    expect(reportedResult(resigned)).toEqual({ result: "loss", resigned: true });
    expect(vsAiOutcomeOf(abandoned)).toBe("loss");
    expect(vsAiOutcomeOf(resigned)).toBe("resigned");
    const white = gameReducer(createGameState({ mode: "vs-ai", humanSide: "white" }), { type: "abandon" });
    expect(reportedResult(white)).toEqual({ result: "loss", resigned: false });
  });

  it("only in a game against the AI that goes on; a new game is not abandoned", () => {
    const two = createGameState();
    expect(gameReducer(two, { type: "abandon" })).toBe(two);
    const over = gameReducer(afterAi, { type: "resign" });
    expect(gameReducer(over, { type: "abandon" })).toBe(over);
    expect(gameReducer(gameReducer(afterAi, { type: "abandon" }), { type: "newGame" }).abandoned).toBe(false);
  });

  it("before the player's first move it is the start of the game, later the middle (as White, after the AI's opening move too)", () => {
    expect(abandonPhaseOf(createGameState({ mode: "vs-ai" }))).toBe("start");
    expect(abandonPhaseOf(afterAi)).toBe("middle");
    const white = createGameState({ mode: "vs-ai", humanSide: "white" });
    const opened = gameReducer(white, { type: "aiMoved", requestId: white.aiRequestId, move: white.legalMoves[0]! });
    expect(abandonPhaseOf(opened)).toBe("start");
  });

  it("the AI's last line says it reported the player, at every level, angry and without laughing at Easy", () => {
    for (const level of LEVELS) {
      const lines = LINE_BANKS[level].abandoned;
      expect(lines.length).toBeGreaterThanOrEqual(10);
      for (const line of lines) expect(line).toMatch(/report/i);
    }
    for (const line of LINE_BANKS[1].abandoned) expect(line).not.toMatch(/\b(haha|hehe|lol)\b/);
  });
});

describe("the abandon minute", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("abandons after a minute without a move, once", () => {
    const fired: number[] = [];
    const timer = createAbandonTimer(() => fired.push(Date.now()));
    timer.update(true, 1);
    vi.advanceTimersByTime(ABANDON_AFTER_MS - 1);
    expect(fired).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(fired).toHaveLength(1);
    vi.advanceTimersByTime(ABANDON_AFTER_MS * 3);
    expect(fired).toHaveLength(1);
    expect(ABANDON_AFTER_MS).toBe(60_000);
  });

  it("a tap on the board starts the minute again", () => {
    let fired = 0;
    const timer = createAbandonTimer(() => (fired += 1));
    timer.update(true, 1);
    vi.advanceTimersByTime(50_000);
    timer.touch();
    vi.advanceTimersByTime(50_000);
    expect(fired).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(fired).toBe(1);
  });

  it("a move (a new turn) starts it again; a sheet, a hidden page or reviewing pause it and start again from zero", () => {
    let fired = 0;
    const timer = createAbandonTimer(() => (fired += 1));
    timer.update(true, 1);
    vi.advanceTimersByTime(55_000);
    timer.update(true, 2); // the player moved, the AI replied
    vi.advanceTimersByTime(55_000);
    timer.update(false, 2); // a sheet opened
    vi.advanceTimersByTime(120_000);
    timer.touch(); // a tap while paused does nothing
    timer.update(true, 2);
    vi.advanceTimersByTime(59_999);
    expect(fired).toBe(0);
    vi.advanceTimersByTime(1);
    expect(fired).toBe(1);
  });
});

describe("reports and the suspension on this device", () => {
  it("every abandoned game is one report: 3 more, 2 more, 1 more, then 30 days suspended and the count back to zero", () => {
    let conduct: Conduct = EMPTY_CONDUCT;
    const lefts: number[] = [];
    for (let n = 1; n <= REPORT_LIMIT - 1; n++) {
      const made = withReport(conduct, report(n, n === 1 ? "start" : "middle"), NOW);
      conduct = made.conduct;
      lefts.push(made.outcome.left);
      expect(made.outcome).toMatchObject({ suspendedNow: false, suspendedUntil: null });
    }
    expect(lefts).toEqual([3, 2, 1]);
    const fourth = withReport(conduct, report(4), NOW);
    expect(fourth.outcome).toEqual({ phase: "middle", left: 0, suspendedUntil: NOW + SUSPENSION_DAYS * DAY, suspendedNow: true });
    expect(fourth.conduct).toMatchObject({ reports: 0, totalReports: 4, suspendedUntil: NOW + 30 * DAY });
    expect(isSuspended(fourth.conduct, NOW + 30 * DAY - 1)).toBe(true);
    expect(isSuspended(fourth.conduct, NOW + 30 * DAY)).toBe(false);
    // After the 30 days the count starts from zero.
    expect(withReport(fourth.conduct, report(5), NOW + 31 * DAY).outcome).toMatchObject({ left: 3, suspendedUntil: null });
  });

  it("the same game is never reported twice; a report while suspended only adds to the total", () => {
    const once = withReport(EMPTY_CONDUCT, report(1), NOW).conduct;
    expect(withReport(once, report(1), NOW).conduct).toBe(once);
    const suspended: Conduct = { ...EMPTY_CONDUCT, totalReports: 4, suspendedUntil: NOW + DAY };
    expect(withReport(suspended, report(9), NOW).conduct).toMatchObject({ reports: 0, totalReports: 5, suspendedUntil: NOW + DAY });
  });

  it("the server's counts win, but never shorten a suspension, lower the total, or overwrite reports still waiting to be sent", () => {
    const local: Conduct = { ...EMPTY_CONDUCT, reports: 2, totalReports: 6, suspendedUntil: null };
    expect(withServer(local, { reports: 1, totalReports: 3, suspendedUntil: null })).toMatchObject({ reports: 1, totalReports: 6, suspendedUntil: null });
    const until = new Date(NOW + 10 * DAY).toISOString();
    expect(withServer(local, { reports: 0, totalReports: 8, suspendedUntil: until })).toMatchObject({ reports: 0, totalReports: 8, suspendedUntil: NOW + 10 * DAY });
    const later = { ...local, suspendedUntil: NOW + 20 * DAY };
    expect(withServer(later, { reports: 0, totalReports: 8, suspendedUntil: until }).suspendedUntil).toBe(NOW + 20 * DAY);
    const waiting = { ...local, pending: [report(3)] };
    expect(withServer(waiting, { reports: 0, totalReports: 1, suspendedUntil: null }).reports).toBe(2);
  });

  it("a stored record is checked when read; anything broken starts again at zero", () => {
    const good = { reports: 2, totalReports: 5, suspendedUntil: null, reported: [id(1)], pending: [report(1)] };
    expect(parseConduct(JSON.stringify(good))).toEqual(good);
    for (const bad of [null, "", "{", '{"reports":9,"totalReports":9,"suspendedUntil":null}', '{"reports":-1,"totalReports":0,"suspendedUntil":null}', '{"reports":1,"totalReports":1,"suspendedUntil":"soon"}']) {
      expect(parseConduct(bad)).toEqual(EMPTY_CONDUCT);
    }
    expect(parseConduct(JSON.stringify({ ...good, pending: [{ gameId: "x", level: 3, phase: "start" }, report(2)] })).pending).toEqual([report(2)]);
  });
});

// The owner's bug: the player was reported, and the profile showed 0
// reports. The server answers 0 until migration 4 is run (and while a
// report is still on its way), and the profile showed only that number.
describe("the profile's report count (owner's bug)", () => {
  const ZERO = { reports: 0, totalReports: 0, suspendedUntil: null };

  it("shows the reports this device made even when the server answers 0", () => {
    let local = EMPTY_CONDUCT;
    local = withReport(local, report(1, "start"), NOW).conduct;
    local = withReport(local, report(2), NOW).conduct;
    // Opening the profile takes the server's answer first: the device keeps its count.
    local = withServer(local, ZERO);
    expect(shownConduct(local, NOW, ZERO)).toEqual({ reports: 2, totalReports: 2, suspendedUntil: null });
  });

  it("takes the server's count when it is higher (reports from another device), and the later suspension", () => {
    const local = withReport(EMPTY_CONDUCT, report(1), NOW).conduct;
    const sent = { ...local, pending: [] };
    expect(shownConduct(sent, NOW, { reports: 3, totalReports: 7, suspendedUntil: null })).toEqual({ reports: 3, totalReports: 7, suspendedUntil: null });
    const until = new Date(NOW + 9 * DAY).toISOString();
    expect(shownConduct(sent, NOW, { reports: 0, totalReports: 8, suspendedUntil: until })).toEqual({ reports: 0, totalReports: 8, suspendedUntil: until });
    const localSuspended = { ...sent, suspendedUntil: NOW + 20 * DAY };
    expect(shownConduct(localSuspended, NOW, ZERO).suspendedUntil).toBe(new Date(NOW + 20 * DAY).toISOString());
    // A suspension that has ended shows as none.
    expect(shownConduct(localSuspended, NOW + 21 * DAY, ZERO).suspendedUntil).toBeNull();
  });

  it("the own profile always shows the Reports row, and its page, from that count", () => {
    const screen = source("src/ui/leaderboard/ProfileScreen.tsx");
    expect(screen).toContain('<Row opens="reports" label="Reports" value={String(reports.totalReports)} onOpen={() => onOpen("reports")} />');
    expect(screen).toContain("const reports = useShownConduct(stats.conduct);");
    expect(screen).toMatch(/function ReportsPage\(\{ server \}: \{ server: ConductStatus \| undefined \}\) \{\s*const conduct = useShownConduct\(server\);/);
    expect(screen).toContain('if (page === "reports" && ready) {');
    expect(source("src/ui/leaderboard/ProfileSheet.tsx")).toContain("const conduct = useShownConduct(server);");
  });
});

describe("sending the reports for the profile", () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key) });
    leaderboardStore.reload(() => NOW);
    conductStore.reload(() => NOW);
  });
  afterEach(() => vi.unstubAllGlobals());
  const PROFILE = { username: "Slow_Mover", country: null, avatar: "a07", token: "A".repeat(43) };

  it("keeps the reports until the server has them, then takes the server's counts", async () => {
    leaderboardStore.setProfile(PROFILE);
    conductStore.report(report(1, "start"));
    conductStore.report(report(2));
    const sent: string[] = [];
    const answers = [{ kind: "serverError" as const, status: 503 }];
    await sendPendingReports({ reportAbandon: async (gameId) => (sent.push(gameId), answers.shift()!) });
    expect(conductStore.get().pending).toHaveLength(2); // migration 4 not run yet: kept
    await sendPendingReports({
      reportAbandon: async (gameId) => (sent.push(gameId), { kind: "ok" as const, value: { reports: gameId === id(1) ? 1 : 2, totalReports: gameId === id(1) ? 1 : 2, suspendedUntil: null } }),
    });
    expect(conductStore.get()).toMatchObject({ pending: [], reports: 2, totalReports: 2 });
    expect(JSON.parse(data.get(CONDUCT_KEY)!)).toMatchObject({ reports: 2, pending: [] });
  });

  it("a refused report is dropped; without a profile nothing is sent", async () => {
    conductStore.report(report(3));
    let calls = 0;
    await sendPendingReports({ reportAbandon: async () => (calls++, { kind: "ok" as const, value: { reports: 0, totalReports: 0, suspendedUntil: null } }) });
    expect(calls).toBe(0);
    leaderboardStore.setProfile(PROFILE);
    await sendPendingReports({ reportAbandon: async () => ({ kind: "failed" as const, status: 400, code: "invalid" }) });
    expect(conductStore.get().pending).toEqual([]);
  });

  it("when the app opens, a suspension made on another device arrives through the own profile", async () => {
    leaderboardStore.setProfile(PROFILE);
    const until = new Date(NOW + 12 * DAY).toISOString();
    await syncConduct({
      reportAbandon: async () => ({ kind: "ok" as const, value: { reports: 0, totalReports: 0, suspendedUntil: null } }),
      profile: async () => ({ kind: "ok" as const, value: { conduct: { reports: 0, totalReports: 4, suspendedUntil: until } } as ProfileResponse }),
    });
    expect(conductStore.isSuspended()).toBe(true);
  });
});

describe("the popups", () => {
  const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);

  it("at the start of a game: please do not start when you are not ready, and how many reports are left", () => {
    const html = render(createElement(AbandonDialog, { outcome: { phase: "start", left: 3, suspendedUntil: null, suspendedNow: false }, onClose: () => {} }));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("Game abandoned");
    expect(html).toContain("Please do not start a game when you are not ready.");
    expect(html).toContain("3 more reports and your account will be suspended for 30 days.");
    expect(reportsLeftText(1)).toBe("1 more report and your account will be suspended for 30 days.");
  });

  it("in the middle of a game: the AI reported you", () => {
    const html = render(createElement(AbandonDialog, { outcome: { phase: "middle", left: 2, suspendedUntil: null, suspendedNow: false }, onClose: () => {} }));
    expect(html).toContain("The AI reported you for not playing.");
    expect(html).toContain("2 more reports and your account will be suspended for 30 days.");
  });

  it("the fourth report: suspended for 30 days, until the date, with the email address", () => {
    const until = NOW + 30 * DAY;
    const html = render(createElement(AbandonDialog, { outcome: { phase: "middle", left: 0, suspendedUntil: until, suspendedNow: true }, onClose: () => {} }));
    expect(html).toContain(`Your account is suspended for 30 days, until ${longDate(until)}.`);
    expect(html).toContain(`<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`);
    expect(CONTACT_EMAIL).toBe("checkervia.games@gmail.com");
    expect(longDate(until)).toBe("18 December 2026");
  });

  it("the suspension popup: the date, what stays open, and the email address", () => {
    const html = render(createElement(SuspendedDialog, { until: NOW + 5 * DAY, onClose: () => {} }));
    expect(html).toContain("Account suspended");
    expect(html).toContain("Your account has been suspended for 30 days: the AI reported you 4 times for not playing.");
    expect(html).toContain("You can play the AI again on 23 November 2026. Two players and Learn are open.");
    expect(html).toContain(`mailto:${CONTACT_EMAIL}`);
    const css = source("src/ui/conduct.css");
    expect(css).toMatch(/\.conduct-dialog \{\s*width: min\(340px, 100%\);/);
    expect(css).toMatch(/\.conduct-contact \{[\s\S]*overflow-wrap: anywhere;/);
  });

  it("the own profile shows the total reports, and the suspension's end", () => {
    const base = { username: "Slow_Mover", country: null, avatar: "a07", gamesPlayed: 5, wins: 1, losses: 4, winRate: 0.2, byLevel: [], bestWin: null, weeklyStrongestRank: null };
    const own = render(createElement(ProfileStats, { profile: { ...base, conduct: { reports: 0, totalReports: 4, suspendedUntil: new Date(NOW + 30 * DAY).toISOString() } } }));
    expect(own).toContain("<dt>Reports</dt>");
    expect(own).toMatch(/<span class="lb-stat-number">4<\/span>/);
    expect(own).toContain("Suspended until 18 December 2026");
    const others = render(createElement(ProfileStats, { profile: base }));
    expect(others).not.toContain("Reports");
  });
});

describe("the wiring", () => {
  it("the game screen runs the minute on the player's turn, taps restart it, and the abandon popup replaces the result panel after the AI's last line", () => {
    const app = source("src/ui/App.tsx");
    expect(app).toContain('touchAbandon.current = useAbandonTimer(state.mode === "vs-ai" && playerTurn && !covered && pageVisible, state.aiRequestId, game.abandon);');
    expect(app).toMatch(/\(position: Position\) => \{\s*touchAbandon\.current\(\);/);
    // The ending: the winner, or a draw (D89).
    expect(app).toContain("useResultPopup(ending, state.lastMove, state.abandoned ? ABANDON_POPUP_EXTRA_MS : 0)");
    expect(app).toContain("{state.winner && result.open && state.abandoned && <AbandonDialog outcome={abandonOutcome} onClose={result.close} />}");
    expect(app).toContain("{over && result.open && !state.abandoned && (");
  });

  it("every way into a game against the AI is closed while suspended; the app and the Profile say so", () => {
    expect(source("src/ui/leaderboard/ProfileGate.tsx")).toMatch(/const request = useCallback\(\(run: \(\) => void\) => \{\s*if \(notifySuspended\(\)\) return;/);
    const root = source("src/ui/Root.tsx");
    expect(root).toMatch(/const already = notifySuspended\(\);\s*void syncConduct\(\)/);
    expect(root).toContain("if (!notifySuspended(() => setProfileOpen(true))) setProfileOpen(true);");
    const app = source("src/ui/App.tsx");
    expect(app).toContain('(mode !== "vs-ai" ? setMode(mode) : notifySuspended() ? undefined : setAskLevel(true))');
    expect(app).toContain("onSelect: () => notifySuspended(() => setProfileOpen(true)) || setProfileOpen(true)");
  });

  it("the Terms say what is kept and give the email address", () => {
    expect(source("src/ui/TermsDialog.tsx")).toContain("The fourth report suspends your account for 30 days");
    expect(source("docs/02-design/terms-and-notices.md")).toContain("Questions about a suspension: checkervia.games@gmail.com.");
  });
});
