// No hyphens or dashes in any text shown to players (owner's rule, D45).
// Renders each screen and dialog and checks the visible text only (class
// names and other attributes are left out). The AI's own lines are cleaned
// in src/ai/language.ts and tested there.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AI_LEVELS, LEVELS } from "../src/ai";
import { App } from "../src/ui/App";
import { ConsentDialog } from "../src/ui/ConsentDialog";
import { LANGUAGE_RULES } from "../src/ui/LanguageInfo";
import { LINE_BANKS } from "../src/ai/lines";
import { Home } from "../src/ui/Home";
import { HowToPlay } from "../src/ui/HowToPlay";
import { LevelDialog } from "../src/ui/LevelDialog";
import { ResultDialog } from "../src/ui/ResultDialog";
import { RulesDialog } from "../src/ui/RulesDialog";
import { WhyContent } from "../src/ui/WhyContent";
import { describeLookahead } from "../src/state/moveFacts";
import { TermsDialog } from "../src/ui/TermsDialog";
import { SettingsSheet } from "../src/ui/SettingsSheet";
import { StatusBar } from "../src/ui/StatusBar";
import { Learn } from "../src/ui/Learn";
import { judgeMove } from "../src/ai/judge";
import { getLegalMoves } from "../src/engine";
import { scenario } from "../src/ui/devScenarios";
import { CountryPicker } from "../src/ui/leaderboard/CountryPicker";
import { LeaderboardScreen, Row, SecondRankedPlayerCard, ThirdRankedPlayerCard, TopRankedPlayerCard } from "../src/ui/leaderboard/LeaderboardScreen";
import { ProfileScreen } from "../src/ui/leaderboard/ProfileScreen";
import { ProfileStats, TierRibbon } from "../src/ui/leaderboard/ProfileSheet";
import { WinStatus } from "../src/ui/leaderboard/WinStatus";
import { USERNAME_MESSAGES } from "../src/leaderboard/username";

const noop = () => {};
const DASHES = /[-‐-―−]/;

// The text between tags, plus the labels a screen reader reads out.
function visibleText(element: ReactElement): string[] {
  const html = renderToStaticMarkup(element);
  const texts = [...html.matchAll(/>([^<]+)</g)].map((match) => match[1]!.trim());
  const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]!);
  return [...texts, ...labels].filter(Boolean);
}

const screens: [string, ReactElement][] = [
  ["home", createElement(Home, { aiStatus: "unreachable", onPlay: noop, onHowToPlay: noop, onLearn: noop, onRecheck: noop, onTerms: noop })],
  ["how to play", createElement(HowToPlay, { onBack: noop, onPlay: noop, onLearn: noop })],
  ["game vs AI at Strongest", createElement(App, { initial: { mode: "vs-ai", aiLevel: 4 }, onMenu: noop })],
  ["two player game", createElement(App, { initial: { mode: "two-player" }, onMenu: noop })],
  ["level dialog", createElement(LevelDialog, { initial: 2, onStart: noop, onCancel: noop })],
  ["rules dialog", createElement(RulesDialog, { onClose: noop })],
  ["terms", createElement(TermsDialog, { onClose: noop })],
  ["settings", createElement(SettingsSheet, { onClose: noop })],
  ["home with the settings link", createElement(Home, { aiStatus: "ready", onPlay: noop, onHowToPlay: noop, onLearn: noop, onRecheck: noop, onTerms: noop, onSettings: noop })],
  [
    "result",
    createElement(ResultDialog, {
      winner: "black",
      mode: "vs-ai",
      reason: "White has no pieces left.",
      stats: { black: { moves: 20, captured: 12, kingsMade: 1, bestChain: 1 }, white: { moves: 19, captured: 4, kingsMade: 0, bestChain: 0 } },
      pieces: { black: 8, white: 0 },
      totalMoves: 39,
      durationMs: 300_000,
      onPlayAgain: noop,
      onReview: noop,
      onClose: noop,
    }),
  ],
  [
    "result with the leaderboard line (D61)",
    createElement(ResultDialog, {
      winner: "black",
      mode: "vs-ai",
      reason: "White has no pieces left.",
      stats: { black: { moves: 20, captured: 12, kingsMade: 1, bestChain: 1 }, white: { moves: 19, captured: 4, kingsMade: 0, bestChain: 0 } },
      pieces: { black: 8, white: 0 },
      totalMoves: 39,
      durationMs: 300_000,
      onPlayAgain: noop,
      onReview: noop,
      onClose: noop,
      leaderboard: createElement(WinStatus, { win: { gameId: "g", level: 4, moves: [] } }),
    }),
  ],
  [
    "why content",
    createElement(WhyContent, {
      explanation: {
        index: 4,
        label: "E3 → F4",
        reason: "Keeps the centre.",
        reaction: null,
        facts: describeLookahead({ depth: 6, score: 100, best: 100, offered: 3, legal: 7, scoresShown: true }, 4),
      },
    }),
  ],
  ["learn", createElement(Learn, { onMenu: noop })],
  // The leaderboard (D57).
  ["home with the leaderboard", createElement(Home, { aiStatus: "ready", onPlay: noop, onHowToPlay: noop, onLearn: noop, onRecheck: noop, onTerms: noop, onLeaderboard: noop })],
  ["leaderboard", createElement(LeaderboardScreen, { onClose: noop })],
  ["top ranked player card", createElement(TopRankedPlayerCard, { row: { rank: 1, username: "Fan", country: null, avatar: "a01", wins: 3, bestMoves: 20 }, mine: true, onOpen: noop })],
  ["second ranked player card", createElement(SecondRankedPlayerCard, { row: { rank: 2, username: "Two", country: "GB", avatar: null, wins: 2, bestMoves: 20 }, mine: false, onOpen: noop })],
  ["third ranked player card", createElement(ThirdRankedPlayerCard, { row: { rank: 3, username: "Three", country: "JP", avatar: "a02", wins: 1, bestMoves: 20 }, mine: false, onOpen: noop })],
  ["ribbons", createElement("div", null, createElement(TierRibbon, { tier: 1 }), createElement(TierRibbon, { tier: 2 }), createElement(TierRibbon, { tier: 3 }))],
  ["leaderboard row", createElement(Row, { row: { rank: 4, username: "Fan", country: "PK", avatar: "a03", wins: 1, bestMoves: 20 }, mine: true, onOpen: noop })],
  ["profile", createElement(ProfileStats, { profile: { username: "Fan", country: "PK", avatar: null, gamesPlayed: 3, wins: 1, losses: 2, winRate: 1 / 3, byLevel: [{ level: 4, wins: 1, losses: 2 }], bestWin: { moves: 20, level: 4 }, weeklyStrongestRank: null } })],
  // D61, D62: the Profile screen, the first game's version, the picker open, the result line.
  ["profile screen", createElement(ProfileScreen, { onClose: noop, onTerms: noop })],
  ["first game profile", createElement(ProfileScreen, { onClose: noop, onTerms: noop, firstGame: true })],
  ["country picker open", createElement(CountryPicker, { value: null, onChange: noop, initiallyOpen: true })],
  [
    "AI failure details (texts from the code, and a model error with hyphens)",
    createElement(StatusBar, {
      currentPlayer: "white",
      winner: null,
      winReason: null,
      captureMandatory: false,
      choosingRoute: false,
      aiPhase: "failed",
      aiFailureReasons: [
        "The engine's look ahead failed, so the AI's moves could not be listed.",
        'No JSON object with a "move" field was found.',
        "The model call failed: rate-limited \u2014 try again in 3-4 s",
      ],
      onRetryAi: noop,
    }),
  ],
  ["consent: age", createElement(ConsentDialog, { step: "age", onAnswer: noop })],
  ["consent: notice", createElement(ConsentDialog, { step: "notice", onAnswer: noop })],
  ["consent: declined", createElement(ConsentDialog, { step: "declined", onAnswer: noop })],
];

describe("no hyphens or dashes in text shown to players", () => {
  it.each(screens)("%s", (_, element) => {
    const texts = visibleText(element);
    expect(texts.length).toBeGreaterThan(2); // really read the screen
    expect(texts.filter((text) => DASHES.test(text))).toEqual([]);
  });

  it("the engine's verdict on a blunder (shown in Why?)", async () => {
    const board = scenario("react")!.board!;
    const blunder = getLegalMoves(board, "black").find((move) => move.to.row === 4 && move.to.col === 3)!;
    const judgement = await judgeMove(board, blunder, "black");
    expect(judgement?.detail).toContain("\u2192");
    expect(judgement?.detail).not.toMatch(DASHES);
  });

  // Texts that only appear after a server answer, so no static render shows them.
  it("the leaderboard's username rules and its messages after an answer", () => {
    for (const message of Object.values(USERNAME_MESSAGES)) expect(message).not.toMatch(DASHES);
    const sources = ["WinStatus.tsx", "winQueue.ts", "ProfileScreen.tsx", "ProfileGate.tsx", "CountryPicker.tsx", "LeaderboardScreen.tsx", "ProfileSheet.tsx", "Problem.tsx"].map((file) => readFileSync(new URL(`../src/ui/leaderboard/${file}`, import.meta.url), "utf8"));
    // Every string literal in these files that reads as a sentence.
    const sentences = sources.flatMap((source) => [...source.matchAll(/"([A-Z][^"]*[a-z][^"]*[.!?])"/g)].map((match) => match[1]!));
    expect(sentences.length).toBeGreaterThan(10);
    expect(sentences.filter((text) => DASHES.test(text))).toEqual([]);
  });

  it("level names, descriptions and voices, the language rules, and every banked line", () => {
    for (const level of LEVELS) expect(`${AI_LEVELS[level].name} ${AI_LEVELS[level].description} ${AI_LEVELS[level].voice}`).not.toMatch(DASHES);
    expect(LANGUAGE_RULES).not.toMatch(DASHES);
    for (const level of LEVELS) for (const lines of Object.values(LINE_BANKS[level])) for (const line of lines) expect(line).not.toMatch(DASHES);
  });
});
