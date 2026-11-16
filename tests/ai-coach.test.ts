// The AI under the board (D64b): the robot's mood, its faces, and where the
// robot and its bubble sit on the game screen.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Move } from "../src/engine";
import { createGameState } from "../src/state/gameReducer";
import type { GameState, HistoryEntry } from "../src/state/gameReducer";
import { App } from "../src/ui/App";
import { aiMood } from "../src/ui/aiMood";
import type { AiMood } from "../src/ui/aiMood";
import { RobotFace } from "../src/ui/RobotFace";

const step = (player: "black" | "white", captured = 0): HistoryEntry => {
  const move: Move = {
    from: { row: 0, col: 0 },
    to: { row: 1, col: 1 },
    path: [{ row: 1, col: 1 }],
    captured: Array.from({ length: captured }, (_, col) => ({ row: 2, col })),
  } as unknown as Move;
  return { board: [], move, player };
};

// A game against the AI whose history ends with `entries` (after the start).
function game(entries: HistoryEntry[], extra: Partial<GameState> = {}): GameState {
  const start = createGameState({ mode: "vs-ai" });
  return { ...start, history: [start.history[0]!, ...entries], ...extra };
}

describe("the robot's mood", () => {
  it("winks at the start of a game (D72), neutral in two player games and while reviewing", () => {
    expect(aiMood(game([]))).toBe("wink");
    expect(aiMood({ ...createGameState({ mode: "two-player" }) })).toBe("neutral");
    expect(aiMood(game([step("black", 1)], { viewIndex: 0 }))).toBe("neutral");
  });

  it("thinks while the AI thinks", () => {
    expect(aiMood(game([step("black")], { aiPhase: "thinking" }))).toBe("thinking");
  });

  it("laughs at the player's blunder, gets angry at a great move", () => {
    expect(aiMood(game([step("black"), { ...step("white"), judgement: { verdict: "blunder", detail: "" } }]))).toBe("laughing");
    expect(aiMood(game([step("black"), { ...step("white"), judgement: { verdict: "great", detail: "" } }]))).toBe("angry");
  });

  it("laughs at its own double capture, is pleased with a single one", () => {
    expect(aiMood(game([step("black"), step("white", 2)]))).toBe("laughing");
    expect(aiMood(game([step("black"), step("white", 1)]))).toBe("happy");
    expect(aiMood(game([step("black"), step("white")]))).toBe("neutral");
  });

  it("is angry when the player takes its pieces, before and after it replies", () => {
    expect(aiMood(game([step("black", 1)]))).toBe("angry");
    expect(aiMood(game([step("black", 1), step("white")]))).toBe("angry");
  });

  it("laughs when it wins and sulks when it loses (D71)", () => {
    expect(aiMood(game([], { winner: "white" }))).toBe("laughing");
    expect(aiMood(game([], { winner: "black" }))).toBe("defeated");
  });

  it("with nothing else going on, smug when clearly winning and nervous when clearly losing (D71)", () => {
    expect(aiMood(game([step("black"), step("white")]), 0.85)).toBe("smug");
    expect(aiMood(game([step("black"), step("white")]), 0.1)).toBe("nervous");
    expect(aiMood(game([step("black"), step("white")]), 0.5)).toBe("neutral");
    // A reaction still comes first.
    expect(aiMood(game([step("black"), step("white", 1)]), 0.1)).toBe("happy");
    expect(aiMood(game([step("black", 1)]), 0.9)).toBe("angry");
  });
});

describe("the robot's faces", () => {
  const face = (mood: AiMood) => renderToStaticMarkup(createElement(RobotFace, { mood }));

  it("one face per mood, each different, all hidden from screen readers", () => {
    const moods: AiMood[] = [
      "neutral", "thinking", "happy", "laughing", "angry", "shocked", "smug", "nervous", "defeated",
      "wink", "starstruck", "proud", "annoyed", "sleepy",
    ];
    const faces = moods.map(face);
    expect(new Set(faces).size).toBe(moods.length);
    for (const [index, html] of faces.entries()) {
      expect(html).toContain(`robot-face-${moods[index]}`);
      expect(html).toContain('aria-hidden="true"');
    }
  });

  it("laughing opens the mouth and sheds a tear; angry turns the eyes red", () => {
    expect(face("laughing")).toContain("robot-mouth-open");
    expect(face("laughing")).toContain("robot-tear");
    expect(face("angry")).toContain("#ff5a4f");
    expect(face("neutral")).not.toContain("#ff5a4f");
  });
});

describe("the game screen against the AI (D64b)", () => {
  const html = renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 2 } }));

  it("the board comes right after the AI card: no bubble between them", () => {
    const game = html.match(/<section class="game"[\s\S]*?<\/section>\s*<aside/)![0];
    expect(game).not.toContain("speech");
    expect(game.indexOf("card-top")).toBeLessThan(game.indexOf("board"));
  });

  it("the robot and its bubble sit under the status line, before the moves", () => {
    const side = html.slice(html.indexOf('<aside class="sidebar"'));
    expect(side.indexOf("status")).toBeLessThan(side.indexOf('class="coach"'));
    expect(side.indexOf('class="coach"')).toBeLessThan(side.indexOf("history"));
    expect(side).toContain('class="speech-slot"');
  });

  it("the AI card wears the same robot face", () => {
    expect(html).toMatch(/<section class="card card-top[\s\S]*?robot-face-wink/);
    expect(html).toContain('class="coach-avatar coach-avatar-wink');
  });

  it("no robot row in a two player game", () => {
    expect(renderToStaticMarkup(createElement(App, { initial: { mode: "two-player" } }))).not.toContain('class="coach"');
  });
});

// D72: more reactions. A board with one piece: a man on `from` before the
// move, the same piece as a King (or still a man) on `to` after it.
describe("more reactions (D72)", () => {
  const empty = () => Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null as null | { player: "black" | "white"; kind: "man" | "king" }));
  const crowning = (player: "black" | "white", king: boolean): [HistoryEntry, HistoryEntry] => {
    const from = { row: player === "white" ? 6 : 1, col: 1 };
    const to = { row: player === "white" ? 7 : 0, col: player === "white" ? 0 : 0 };
    const before = empty();
    before[from.row]![from.col] = { player, kind: "man" };
    const after = empty();
    after[to.row]![to.col] = { player, kind: king ? "king" : "man" };
    const move = { from, to, path: [to], captured: [] } as unknown as Move;
    return [{ board: before, move: null, player: null }, { board: after, move, player }];
  };
  const withHistory = (entries: HistoryEntry[], extra: Partial<GameState> = {}): GameState => ({ ...createGameState({ mode: "vs-ai" }), history: entries, ...extra });

  it("starstruck when it takes three or more pieces at once", () => {
    expect(aiMood(game([step("black"), step("white", 3)]))).toBe("starstruck");
    expect(aiMood(game([step("black"), step("white", 2)]))).toBe("laughing");
  });

  it("proud when it makes a King, not for an ordinary move to the edge", () => {
    const [start, crowned] = crowning("white", true);
    expect(aiMood(withHistory([start, step("black"), crowned].map((entry, index) => (index === 1 ? { ...entry, board: start.board } : entry))))).toBe("proud");
    const [start2, plain] = crowning("white", false);
    expect(aiMood(withHistory([start2, { ...step("black"), board: start2.board }, plain]))).not.toBe("proud");
  });

  it("rolls its eyes at the player's new King, at once while it thinks", () => {
    const [start, crowned] = crowning("black", true);
    expect(aiMood(withHistory([start, crowned], { aiPhase: "thinking" }))).toBe("annoyed");
    expect(aiMood(withHistory([start, crowned, { ...step("white"), board: crowned.board }]))).toBe("annoyed");
  });

  it("dozes off at the second idle line and gets angry from the third (set by App, after the resign pressure; D73)", () => {
    const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/idleCount >= ANGRY_FROM_IDLE\s*\? "angry"\s*: idleCount === 2\s*\? "sleepy"/);
    expect(source.indexOf("personality.pressure\n")).toBeLessThan(source.indexOf("idleCount >= ANGRY_FROM_IDLE"));
  });

  it("each new face has its own look", () => {
    const face = (mood: AiMood) => renderToStaticMarkup(createElement(RobotFace, { mood }));
    expect(face("starstruck")).toContain("<polygon");
    expect(face("proud")).toContain("robot-crown");
    expect(face("annoyed")).toContain("robot-roll");
    expect(face("sleepy")).toContain("robot-zz");
    expect(face("wink")).toContain("robot-wink");
  });
});
