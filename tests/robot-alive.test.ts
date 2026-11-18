import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Move, Player } from "../src/engine";
import { createGameState } from "../src/state/gameReducer";
import type { GameState, HistoryEntry } from "../src/state/gameReducer";
import { aiMood } from "../src/ui/aiMood";
import { RobotFace } from "../src/ui/RobotFace";

const step = (player: Player, captures = 0): HistoryEntry => ({
  board: [], player,
  move: { from: { row: 5, col: 0 }, to: { row: 3, col: 2 }, path: [{ row: 3, col: 2 }], captured: Array.from({ length: captures }, (_, col) => ({ row: 4, col })) } as Move,
});
function game(human: Player, entries: HistoryEntry[], extra: Partial<GameState> = {}): GameState {
  const initial = createGameState({ mode: "vs-ai", humanSide: human });
  return { ...initial, aiPhase: "idle", history: [initial.history[0]!, ...entries], ...extra };
}

describe.each(["black", "white"] as const)("the living robot against a %s player", (human) => {
  const ai = human === "black" ? "white" : "black";
  it.each([3, 4])("looks alarmed at %i captures, before thinking and during its reply", (captures) => {
    const entries = [step(human, captures)];
    expect(aiMood(game(human, entries))).toBe("alarmed");
    expect(aiMood(game(human, entries, { aiPhase: "thinking" }))).toBe("alarmed");
    expect(aiMood(game(human, [...entries, step(ai)]))).toBe("alarmed");
  });
  it("keeps its confident double-capture surprise", () => {
    expect(aiMood(game(human, [step(human, 2)], { aiPhase: "thinking" }))).toBe("shocked");
    expect(aiMood(game(human, [step(human, 2), step(ai)]))).toBe("shocked");
  });
  it("does not let a verdict or capture hide its triple-capture worry", () => {
    for (const verdict of ["great", "blunder"] as const) {
      const reply = { ...step(ai, 1), judgement: { verdict, detail: "" } };
      expect(aiMood(game(human, [step(human, 3), reply]))).toBe("alarmed");
    }
  });
  it("leaves the alarm behind after the player's next quiet move", () => {
    expect(aiMood(game(human, [step(human, 3), step(ai), step(human)]))).toBe("neutral");
  });
  it("keeps losing sad even when the final move was a triple capture", () => {
    const entries = [step(human, 3)];
    expect(aiMood(game(human, entries, { winner: human }))).toBe("defeated");
    expect(aiMood(game(human, entries, { winner: human, resignedBy: ai }))).toBe("defeated");
    expect(aiMood(game(human, entries, { viewIndex: 0 }))).toBe("neutral");
  });
});

describe("the added expressions", () => {
  it("distinguishes popped eyes and a worried gasp from confident surprise", () => {
    const alarmed = renderToStaticMarkup(createElement(RobotFace, { mood: "alarmed" }));
    expect(alarmed).toContain("robot-alarm-pupils");
    expect(alarmed).toContain("robot-gasp");
    expect(alarmed).toContain("robot-sweat");
    expect(alarmed).not.toContain("robot-smirk");
    const shocked = renderToStaticMarkup(createElement(RobotFace, { mood: "shocked" }));
    expect(shocked).toContain("robot-smirk");
    expect(shocked).not.toContain("robot-gasp");
  });
  it("adds teeth and a moving jaw to the existing laughing eyes and tears", () => {
    const laughing = renderToStaticMarkup(createElement(RobotFace, { mood: "laughing" }));
    expect(laughing).toContain("robot-laugh-mouth");
    expect(laughing).toContain("robot-tear");
    expect(laughing).toContain('fill="#ffffff"');
    expect(laughing.match(/class="robot-expression /g)).toHaveLength(1);
  });
});
