// D69, D70: once the position is proven lost, the AI asks the stalling
// player to resign (each message 10 seconds, then 5 of typing dots), laughs
// at the end with a
// random "haha", and is shocked (but confident) by a double capture.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Move } from "../src/engine";
import { LINE_BANKS, WIN_LAUGHS, withWinLaugh } from "../src/ai/lines";
import { createGameState } from "../src/state/gameReducer";
import type { GameState, HistoryEntry } from "../src/state/gameReducer";
import { aiMood } from "../src/ui/aiMood";
import { reactionBubble } from "../src/ui/bubble";
import { PRESSURE_GAP_MS, PRESSURE_SHOW_MS, createPressureTimer } from "../src/ui/idleTimer";
import type { PressureState } from "../src/ui/idleTimer";
import { RobotFace } from "../src/ui/RobotFace";
import { endContext } from "../src/ui/usePersonality";

// Hand driven timers: run(ms) moves the clock on.
function fakeTimers() {
  let now = 0;
  let queue: { at: number; run: () => void; id: number }[] = [];
  let next = 1;
  return {
    timers: {
      setTimeout: (run: () => void, ms: number) => {
        const id = next++;
        queue.push({ at: now + ms, run, id });
        return id;
      },
      clearTimeout: (id: unknown) => {
        queue = queue.filter((entry) => entry.id !== id);
      },
    },
    run(ms: number) {
      const end = now + ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at);
        const first = queue[0];
        if (!first || first.at > end) break;
        queue.shift();
        now = first.at;
        first.run();
      }
      now = end;
    },
  };
}

describe("the resign pressure's clock", () => {
  const setup = () => {
    const clock = fakeTimers();
    const seen: PressureState[] = [];
    const timer = createPressureTimer((state) => seen.push(state), clock.timers);
    return { clock, seen, timer };
  };

  it("10 seconds on, 5 seconds of typing, then the next ask, for as long as the player waits", () => {
    expect([PRESSURE_SHOW_MS, PRESSURE_GAP_MS]).toEqual([10_000, 5_000]);
    const { clock, seen, timer } = setup();
    timer.update(true, 1);
    clock.run(PRESSURE_SHOW_MS - 1);
    expect(seen).toEqual([]); // the AI's own line keeps its full 10 seconds
    clock.run(1);
    expect(seen.at(-1)).toEqual({ count: 0, showing: false });
    clock.run(PRESSURE_GAP_MS);
    expect(seen.at(-1)).toEqual({ count: 1, showing: true });
    clock.run(PRESSURE_SHOW_MS + PRESSURE_GAP_MS);
    expect(seen.at(-1)).toEqual({ count: 2, showing: true });
    expect(seen).toHaveLength(4);
  });

  it("pauses while inactive and gives a message its full 10 seconds after", () => {
    const { clock, seen, timer } = setup();
    timer.update(true, 1);
    clock.run(6_000);
    timer.update(false, 1); // the player picked up a piece, or a sheet opened
    clock.run(60_000);
    expect(seen).toEqual([]);
    timer.update(true, 1);
    clock.run(PRESSURE_SHOW_MS - 1);
    expect(seen).toEqual([]);
    clock.run(1);
    expect(seen).toEqual([{ count: 0, showing: false }]);
  });

  it("starts again at the AI's own line on a new turn", () => {
    const { clock, seen, timer } = setup();
    timer.update(true, 1);
    clock.run(PRESSURE_SHOW_MS + PRESSURE_GAP_MS);
    timer.update(false, 2);
    expect(seen.at(-1)).toEqual({ count: 0, showing: true });
  });
});

describe("what the bubble shows under pressure", () => {
  const lost = createGameState({ mode: "vs-ai" });

  it("an ask to resign beats everything but the typing dots; only the first is read out", () => {
    const first = reactionBubble(lost, { pressure: { key: "push-1-1", text: "Resign, lol.", count: 1 }, idle: { key: "i", text: "Tick.", count: 1 } });
    expect(first).toEqual({ key: "push-1-1", text: "Resign, lol.", tone: "banter", why: false, announce: true });
    expect(reactionBubble(lost, { pressure: { key: "push-1-2", text: "Again.", count: 2 } })?.announce).toBe(false);
  });

  it("typing dots in the 5 seconds before each ask, never read out", () => {
    const dots = reactionBubble(lost, { pressure: { key: "push-1-1", text: null, count: 1 }, greeting: "Hi!" });
    expect(dots).toEqual({ key: "push-1-1", text: null, tone: "banter", why: false, announce: false });
  });
});

describe("the AI's last line when it wins", () => {
  it("ends with a random laugh: haha, hahaha or hahahahah", () => {
    expect(withWinLaugh("Game over.", 4, () => 0)).toBe("Game over. Haha!");
    expect(withWinLaugh("Game over.", 3, () => 0.5)).toBe("Game over. Hahaha!");
    expect(withWinLaugh("Game over.", 2, () => 0.99)).toBe("Game over. Hahahahah!");
    expect(WIN_LAUGHS).toEqual(["Haha!", "Hahaha!", "Hahahahah!"]);
  });

  it("never past the 140 character cap, and Easy stays kind", () => {
    const long = "x".repeat(132);
    expect(withWinLaugh(long, 4, () => 0.99)).toBe(`${long} Haha!`);
    expect(withWinLaugh("y".repeat(139), 4)).toBe("y".repeat(139));
    expect(withWinLaugh("Good game!", 1)).toBe("Good game!");
  });

  it("taunts the player who would not resign, at every level", () => {
    const start = createGameState({ mode: "vs-ai" });
    const proven: HistoryEntry = { ...start.history[0]!, provenLoss: true };
    expect(endContext({ ...start, winner: "white", history: [start.history[0]!, proven] })).toBe("aiWonStubborn");
    expect(endContext({ ...start, winner: "white" })).toBe("aiWon");
    expect(endContext({ ...start, winner: "white", resignedBy: "black", history: [start.history[0]!, proven] })).toBe("resigned");
    for (const level of [1, 2, 3, 4] as const) expect(LINE_BANKS[level].aiWonStubborn.length).toBeGreaterThanOrEqual(10);
  });
});

describe("shocked by a double capture, but confident", () => {
  const step = (player: "black" | "white", captured: number): HistoryEntry => ({
    board: [],
    player,
    move: { from: { row: 0, col: 0 }, to: { row: 1, col: 1 }, path: [], captured: Array.from({ length: captured }, (_, col) => ({ row: 2, col })) } as unknown as Move,
  });
  const game = (entries: HistoryEntry[], extra: Partial<GameState> = {}): GameState => {
    const start = createGameState({ mode: "vs-ai" });
    return { ...start, history: [start.history[0]!, ...entries], ...extra };
  };

  it("at once, while it thinks, and after its reply unless it took two back", () => {
    expect(aiMood(game([step("black", 2)], { aiPhase: "thinking" }))).toBe("shocked");
    expect(aiMood(game([step("black", 1)], { aiPhase: "thinking" }))).toBe("thinking");
    expect(aiMood(game([step("black", 2), step("white", 0)]))).toBe("shocked");
    expect(aiMood(game([step("black", 2), step("white", 2)]))).toBe("laughing");
  });

  it("wide eyes, one brow up and a smirk, not a frown", () => {
    const html = renderToStaticMarkup(createElement(RobotFace, { mood: "shocked" }));
    expect(html).toContain("robot-face-shocked");
    expect(html).toContain("robot-smirk");
    expect(html).not.toContain("#ff5a4f"); // no angry red
  });
});
