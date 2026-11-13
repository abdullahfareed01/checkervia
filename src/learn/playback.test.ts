import { describe, expect, it } from "vitest";
import { buildFrames } from "./frames";
import type { Frame } from "./frames";
import { LESSONS } from "./lessons";
import { frameDelay, targetIndex } from "./playback";

const frames = buildFrames(LESSONS);
const withCaption = (caption: string): Frame => ({ ...frames[0]!, caption });

describe("frameDelay", () => {
  it("gives short captions at least 3.5 s", () => {
    expect(frameDelay(withCaption("Hi."), 0)).toBe(3_500);
  });

  it("gives longer captions more time, up to 10 s", () => {
    const twenty = frameDelay(withCaption("word ".repeat(20)), 0);
    expect(twenty).toBe(1_500 + 20 * 280);
    expect(frameDelay(withCaption("word ".repeat(200)), 0)).toBe(10_000);
  });

  it("waits for the move animation first", () => {
    expect(frameDelay(withCaption("Hi."), 900)).toBe(4_400);
  });
});

describe("targetIndex", () => {
  const secondSceneStart = frames.findIndex((frame) => frame.sceneIndex === 1);

  it("steps back and forward, without leaving the list", () => {
    expect(targetIndex(frames, 3, "back")).toBe(2);
    expect(targetIndex(frames, 3, "forward")).toBe(4);
    expect(targetIndex(frames, 0, "back")).toBe(0);
    expect(targetIndex(frames, frames.length - 1, "forward")).toBe(frames.length - 1);
  });

  it("first and last stay inside the current scene", () => {
    expect(targetIndex(frames, secondSceneStart + 1, "first")).toBe(secondSceneStart);
    const last = targetIndex(frames, secondSceneStart, "last");
    expect(frames[last]!.sceneIndex).toBe(1);
    expect(frames[last + 1]!.sceneIndex).toBe(2);
  });

  it("jumps to a scene's intro", () => {
    expect(targetIndex(frames, 0, { scene: 1 })).toBe(secondSceneStart);
    expect(targetIndex(frames, 5, { scene: 99 })).toBe(5);
  });
});
