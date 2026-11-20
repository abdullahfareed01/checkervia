// The online screens (D142, D143) rendered as markup: what they say and offer,
// what screen readers get, no hyphens or dashes in any player text (owner
// rule), and what the online game leaves out (no undo, no AI, no levels).
import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerCard } from "../../src/ui/PlayerCard";
import { JoinForm } from "../../src/ui/online/JoinForm";
import { OnlineGame } from "../../src/ui/online/OnlineGame";
import { ReadyOverlay } from "../../src/ui/online/ReadyOverlay";
import { refusalText, roomProblemText } from "../../src/ui/online/roomErrors";
import { WaitingRoom } from "../../src/ui/online/WaitingRoom";
import { ONLINE_SCREENS, result, sheet, waiting } from "./onlineScreens";
import { connection, roomView } from "./views";
import { readFileSync } from "node:fs";
import { TERMS_SECTIONS } from "../../src/ui/TermsDialog";

const noop = () => {};
const DASHES = /[-‐-―−]/;
const html = (element: ReactElement) => renderToStaticMarkup(element);
function visibleText(element: ReactElement): string[] {
  const markup = html(element);
  return [...[...markup.matchAll(/>([^<]+)</g)].map((match) => match[1]!.trim()), ...[...markup.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]!)].filter(Boolean);
}

describe("the online screens", () => {
  it.each(ONLINE_SCREENS)("%s: no hyphens or dashes", (_, element) => {
    const texts = visibleText(element);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((text) => DASHES.test(text))).toEqual([]);
  });

  it("every error and refusal message has no dashes either", () => {
    const codes = ["invalid", "roomNotFound", "roomFull", "roomExpired", "roomClosed", "notMember", "noProfile", "tooManyRooms", "other"];
    const texts = [
      ...codes.map(refusalText),
      ...codes.map((code) => roomProblemText({ kind: "failed", status: 409, code })),
      roomProblemText({ kind: "offline" }),
      roomProblemText({ kind: "serverError", status: 503 }),
      roomProblemText({ kind: "failed", status: 429, code: "rateLimited", retryAfter: 30 }),
    ];
    expect(texts.filter((text) => DASHES.test(text))).toEqual([]);
  });

  it("2 Players offers one screen or online with a friend; online offers create or join", () => {
    expect(html(sheet({ kind: "choose" }))).toMatch(/Same screen[\s\S]*Online with a friend/);
    expect(html(sheet({ kind: "online" }))).toMatch(/Create a room[\s\S]*Join with a code/);
    expect(html(sheet({ kind: "choose" }))).toContain('role="dialog"');
  });

  it("the code field: tidied, capitals, no zoom, nothing guessed by the keyboard", () => {
    const markup = html(createElement(JoinForm, { initialCode: "k7q-h3m", autoJoin: false, onJoined: noop }));
    expect(markup).toContain('value="K7QH3M"');
    expect(markup).toContain('autoCapitalize="characters"');
    expect(markup).toContain('autoComplete="off"');
    expect(markup).toContain('spellCheck="false"');
    expect(markup).toMatch(/<label[^>]*for="[^"]+"[^>]*>Room code<\/label>/);
  });

  it("the waiting room shows the code letter by letter, Copy and Share, and an empty seat", () => {
    const markup = html(createElement(WaitingRoom, { room: connection(waiting), onLeave: noop }));
    expect(markup).toContain('aria-label="Room code K 7 Q H 3 M"');
    expect(markup).toMatch(/Copy[\s\S]*Share/);
    expect(markup).toContain("Waiting for your friend");
    expect(markup).toContain("online-seat-pulse");
  });

  it("the ready screen: both players, their colours, then 3, 2, 1", () => {
    const markup = html(createElement(ReadyOverlay, { view: roomView({ status: "ready" }), seconds: 2 }));
    expect(markup).toMatch(/You_Player[\s\S]*You play Black[\s\S]*Zara_K[\s\S]*White/);
    expect(markup).toContain(">2<");
    expect(html(createElement(ReadyOverlay, { view: roomView({ status: "ready" }), seconds: 4 }))).toContain("Starting");
  });

  it("the online game leaves out undo, the AI and its levels, and keeps Resign and Leave", () => {
    const markup = html(createElement(OnlineGame, { room: connection(roomView()), onLeave: noop }));
    expect(markup).not.toContain("Previous move");
    expect(markup).not.toContain("Next move");
    expect(markup).not.toMatch(/Why\?|AI is thinking|BOT|winbar|coach/);
    expect(markup).toContain("Resign");
    expect(markup).toContain("Leave");
    expect(markup).toContain("Your turn");
    expect(markup).toContain("Zara_K");
  });

  it("the opponent's card has their flag and presence for screen readers", () => {
    const markup = html(
      createElement(PlayerCard, { player: "white", name: "Zara_K", robot: false, pieces: 12, captured: 0, toMove: false, thinking: true, portrait: "a05", winner: false, placement: "top", flag: "PK", presence: "away" }),
    );
    expect(markup).toContain('aria-label="Zara_K, Pakistan, White, away: Thinking. 12 pieces left, took 0."');
    expect(markup).toContain("presence-dot presence-away");
    expect(markup).toContain("lb-flag");
  });

  it("the online result names the winner by username, with Rematch and Leave room in place of Play Again", () => {
    const markup = html(result(true));
    expect(markup).toContain("Zara_K Wins");
    expect(markup).toContain("Rematch");
    expect(markup).toContain("Leave room");
    expect(markup).not.toContain("Play Again");
    expect(markup).not.toContain("confetti"); // you lost
    expect(html(result(false))).toContain("White Wins");
  });

  it("the Terms say what other players see, how long rooms are kept, and that online games never count", () => {
    const online = TERMS_SECTIONS.find((section) => section.title === "Online play with a friend")!.points.join(" ");
    for (const phrase of ["sees your username, avatar and flag", "nobody can watch", "checks every move", "never count on the leaderboard", "60 second countdown", "expires", "deleted 30 days after its last use", "at most 3 rooms"]) {
      expect(online).toContain(phrase);
    }
    // The doc says the same.
    const doc = readFileSync(new URL("../../docs/02-design/terms-and-notices.md", import.meta.url), "utf8");
    for (const point of TERMS_SECTIONS.find((section) => section.title === "Online play with a friend")!.points) expect(doc).toContain(point);
  });
});
