import { describe, expect, it } from "vitest";
import type { AiMood } from "../src/ui/aiMood";
import { betweenPaths, MORPH_MS, WINK_MS, WINK_OPEN_EYE, WINK_CLOSED_EYE, pathData, robotPose, winkEyeAt } from "../src/ui/robotGeometry";
import { sampleFace } from "../src/ui/useRobotMorph";

const moods: readonly AiMood[] = ["neutral", "thinking", "happy", "laughing", "angry", "shocked", "alarmed", "smug", "nervous", "defeated", "wink", "starstruck", "proud", "annoyed", "sleepy"];

describe("continuous robot geometry", () => {
  it.each(moods)("keeps every %s feature compatible with every other pose", (mood) => {
    const pose = robotPose(mood);
    for (const other of moods) {
      const target = robotPose(other);
      for (const key of Object.keys(pose.paths) as (keyof typeof pose.paths)[]) {
        const from = pose.paths[key], to = target.paths[key];
        expect(pathData(from).match(/[MCZ]/g)).toEqual(pathData(to).match(/[MCZ]/g));
        expect(from.points.length).toBe(to.points.length);
        expect(betweenPaths(from, to, 0)).toEqual(from);
        betweenPaths(from, to, 1).points.forEach((value, i) => expect(value).toBeCloseTo(to.points[i]!, 9));
        expect(betweenPaths(from, to, 0.5).points.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("keeps the mirrored right eye's winding consistent, so it does not collapse", () => {
    const area = (points: readonly number[]) => {
      const anchors = [points.slice(0, 2), ...Array.from({ length: (points.length - 2) / 6 }, (_, i) => points.slice(6 + i * 6, 8 + i * 6))];
      return anchors.reduce((sum, point, i) => {
        const next = anchors[(i + 1) % anchors.length]!;
        return sum + point[0]! * next[1]! - next[0]! * point[1]!;
      }, 0);
    };
    for (const mood of moods) {
      const { leftEye, rightEye } = robotPose(mood).paths;
      expect(Math.sign(area(rightEye.points))).toBe(Math.sign(area(leftEye.points)));
    }
  });

  it("reverses from the displayed intermediate face without resetting to a named mood", () => {
    const happy = robotPose("happy").paths, angry = robotPose("angry").paths;
    const first = { from: happy, to: angry, started: 1000 };
    const displayed = sampleFace(first, 1000 + MORPH_MS * 0.4);
    const reversed = { from: displayed, to: happy, started: 1000 + MORPH_MS * 0.4 };
    expect(sampleFace(reversed, reversed.started)).toEqual(displayed);
    expect(displayed.leftEye).not.toEqual(happy.leftEye);
    expect(displayed.leftEye).not.toEqual(angry.leftEye);
    sampleFace(reversed, reversed.started + MORPH_MS).mouth.points.forEach((value, i) => expect(value).toBeCloseTo(happy.mouth.points[i]!, 9));
  });

  it("clamps interrupted and finished times and never changes a source pose", () => {
    const from = robotPose("alarmed").paths.mouth, to = robotPose("happy").paths.mouth;
    const snapshot = structuredClone(from);
    expect(betweenPaths(from, to, -1)).toEqual(from);
    expect(pathData(betweenPaths(from, to, 10))).toBe(pathData(to));
    betweenPaths(from, to, 0.3);
    expect(from).toEqual(snapshot);
  });

  it("makes the static wink unmistakable with one narrow eye and one fully open eye", () => {
    const { leftEye, rightEye } = robotPose("wink").paths;
    const height = (points: readonly number[]) => {
      const y = points.filter((_, i) => i % 2 === 1);
      return Math.max(...y) - Math.min(...y);
    };
    expect(height(leftEye.points)).toBeLessThan(0.8);
    expect(height(rightEye.points)).toBeGreaterThan(5);
  });

  it("closes, holds, reopens and meets the next wink at the same open pose", () => {
    expect(winkEyeAt(0)).toEqual(WINK_OPEN_EYE);
    expect(winkEyeAt(WINK_MS * 0.14)).toEqual(WINK_CLOSED_EYE);
    expect(winkEyeAt(WINK_MS * 0.25)).not.toEqual(WINK_CLOSED_EYE);
    expect(winkEyeAt(WINK_MS * 0.4)).toEqual(WINK_OPEN_EYE);
    expect(winkEyeAt(WINK_MS)).toEqual(winkEyeAt(0));
    expect(winkEyeAt(WINK_MS * 1.14)).toEqual(WINK_CLOSED_EYE);
  });

  it("leaves a closed wink from its displayed shape, without closing the other eye", () => {
    const paths = { ...robotPose("wink").paths, leftEye: WINK_OPEN_EYE };
    const frame = { from: paths, to: paths, started: 1000, wink: true };
    const now = 1000 + MORPH_MS + WINK_MS * 0.14;
    const shown = sampleFace(frame, now);
    expect(shown.leftEye).toEqual(WINK_CLOSED_EYE);
    expect(shown.rightEye).toEqual(paths.rightEye);
    const exit = { from: shown, to: robotPose("angry").paths, started: now };
    expect(sampleFace(exit, now)).toEqual(shown);
  });
});
