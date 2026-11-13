// The Learn script must only show legal moves, and each scene must really
// show what its captions claim.
import { describe, expect, it } from "vitest";
import { boardFrom, initialBoard, pieceAt } from "../engine";
import { buildFrames } from "./frames";
import type { Frame, Scene } from "./frames";
import { LESSONS } from "./lessons";

const frames = buildFrames(LESSONS);
const sceneOf = (index: number) => frames.filter((frame) => frame.sceneIndex === index);
const last = (list: Frame[]) => list[list.length - 1]!;

describe("buildFrames on the real lessons", () => {
  it("builds an intro plus one frame per move for every scene (every move is legal)", () => {
    const expected = LESSONS.reduce((total, scene) => total + 1 + scene.steps.length, 0);
    expect(frames).toHaveLength(expected);
    LESSONS.forEach((scene, i) => {
      expect(sceneOf(i)[0]).toMatchObject({ stepIndex: 0, move: null, caption: scene.intro, title: scene.title });
    });
  });

  it("scene 1: starts from the real opening and shows a forced capture and a recapture", () => {
    const scene = sceneOf(0);
    expect(scene[0]!.board).toEqual(initialBoard());
    expect(scene[2]!.mustCapture).toEqual([{ row: 4, col: 3 }]); // Black must capture
    expect(scene[3]!.move!.captured).toHaveLength(1);
    expect(scene[3]!.mustCapture).toHaveLength(2); // two white pieces can recapture
    expect(last(scene).captured).toEqual({ black: 1, white: 1 });
    expect(last(scene).winner).toBeNull();
  });

  it("scene 2: a double jump, then crowning, then Black wins", () => {
    const scene = sceneOf(1);
    expect(scene[1]!.move!.captured).toHaveLength(2);
    expect(scene[1]!.facts[0]!.text).toContain("Multi jump");
    const final = last(scene);
    expect(pieceAt(final.board, { row: 0, col: 7 })).toEqual({ player: "black", kind: "king" });
    expect(final.winner).toBe("black");
    expect(final.facts.map((fact) => fact.text)).toContain("This move wins the game.");
  });

  it("scene 3: the King captures backward (toward its own side)", () => {
    const capture = sceneOf(2)[1]!.move!;
    expect(capture.captured).toHaveLength(1);
    expect(capture.to.row).toBeGreaterThan(capture.from.row); // Black's forward is up
  });

  it("scene 4: Black wins because White has no legal move, not because it has no pieces", () => {
    const final = last(sceneOf(3));
    expect(final.winner).toBe("black");
    expect(final.board.flat().some((piece) => piece?.player === "white")).toBe(true);
  });

  it("previousBoard of each move frame is the board of the frame before", () => {
    frames.forEach((frame, i) => {
      if (frame.stepIndex > 0) expect(frame.previousBoard).toBe(frames[i - 1]!.board);
    });
  });
});

describe("buildFrames rejects a bad script", () => {
  const scene = (path: [number, number][]): Scene[] => [
    { title: "Bad", intro: "", board: initialBoard(), toMove: "black", steps: [{ path, caption: "" }] },
  ];

  it("throws on an illegal move, naming the scene and move", () => {
    expect(() => buildFrames(scene([[5, 2], [3, 2]]))).toThrow("Bad, move 1: not a legal move for black");
  });

  it("throws on a move by the wrong side", () => {
    expect(() => buildFrames(scene([[2, 1], [3, 2]]))).toThrow("not a legal move");
  });

  it("throws on a plain move when a capture is mandatory", () => {
    const board = boardFrom(["........", "........", "........", "....w...", "...b....", "........", ".b......", "........"]);
    const steps = [{ path: [[6, 1], [5, 0]] as [number, number][], caption: "" }];
    expect(() => buildFrames([{ title: "Forced", intro: "", board, toMove: "black", steps }])).toThrow("not a legal move");
  });

  it("throws on a move after the game is over", () => {
    const board = boardFrom([".w......", "..b.....", "........", "........", "........", "........", "........", "........"]);
    const steps = [
      { path: [[0, 1], [2, 3]] as [number, number][], caption: "" },
      { path: [[2, 3], [3, 4]] as [number, number][], caption: "" },
    ];
    expect(() => buildFrames([{ title: "Over", intro: "", board, toMove: "white", steps }])).toThrow("already over");
  });
});
