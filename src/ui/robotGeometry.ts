// Every pose uses the same path commands. Native SVG animation can then
// bend the existing eyes and mouth instead of replacing their drawings.
import type { AiMood } from "./aiMood";

type Point = readonly [number, number];
export interface FacePath { readonly points: readonly number[]; readonly closed: boolean }

function contour(points: readonly Point[], bend = 0.16): FacePath {
  const values = [...points[0]!];
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length]!;
    const start = points[i]!;
    const end = points[(i + 1) % points.length]!;
    const next = points[(i + 2) % points.length]!;
    values.push(start[0] + (end[0] - previous[0]) * bend, start[1] + (end[1] - previous[1]) * bend,
      end[0] - (next[0] - start[0]) * bend, end[1] - (next[1] - start[1]) * bend, ...end);
  }
  return { points: values, closed: true };
}

function oval(cx: number, cy: number, rx: number, ry: number, count = 8): FacePath {
  return contour(Array.from({ length: count }, (_, i): Point => {
    const angle = Math.PI + i * Math.PI * 2 / count;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
  }));
}

function shift(path: FacePath, dx: number, mirror = false): FacePath {
  if (!mirror) return { ...path, points: path.points.map((value, i) => i % 2 ? value : value + dx) };
  if (!path.closed) {
    const points: number[] = [];
    for (let i = path.points.length - 2; i >= 0; i -= 2) points.push(48 - path.points[i]!, path.points[i + 1]!);
    return { ...path, points };
  }
  // Reflection reverses winding. Reverse the curves too, starting on the
  // left edge again, so a right eye never folds inside out mid-morph.
  const count = (path.points.length - 2) / 6;
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const segment = (count / 2 - 1 - i + count) % count;
    const start = segment === 0 ? path.points.slice(0, 2) : path.points.slice(2 + (segment - 1) * 6 + 4, 2 + segment * 6);
    const curve = path.points.slice(2 + segment * 6, 8 + segment * 6);
    if (i === 0) values.push(48 - curve[4]!, curve[5]!);
    values.push(48 - curve[2]!, curve[3]!, 48 - curve[0]!, curve[1]!, 48 - start[0]!, start[1]!);
  }
  return { ...path, points: values };
}

function brow(from: Point, control: Point, to: Point): FacePath {
  return { closed: false, points: [...from,
    from[0] + (control[0] - from[0]) * 2 / 3, from[1] + (control[1] - from[1]) * 2 / 3,
    to[0] + (control[0] - to[0]) * 2 / 3, to[1] + (control[1] - to[1]) * 2 / 3, ...to] };
}

function ribbon(points: readonly Point[], width: number): FacePath {
  const edge = (sign: number): Point[] => points.map((point, i) => {
    const before = points[Math.max(0, i - 1)]!;
    const after = points[Math.min(points.length - 1, i + 1)]!;
    const dx = after[0] - before[0], dy = after[1] - before[1];
    const length = Math.hypot(dx, dy) || 1;
    return [point[0] - dy / length * width / 2 * sign, point[1] + dx / length * width / 2 * sign];
  });
  return contour([...edge(-1), ...edge(1).reverse()], 0.1);
}

function smile(from: Point, control: Point, to: Point, width = 1.8): FacePath {
  return ribbon(Array.from({ length: 6 }, (_, i): Point => {
    const t = i / 5, u = 1 - t;
    return [u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * control[1] + t * t * to[1]];
  }), width);
}

const roundEye = oval(19.5, 21.25, 2.5, 2.75);
const happyEye = contour([[16, 23], [17.6, 20.5], [19.5, 19.7], [21.4, 20.5], [23, 23], [21.3, 23.6], [19.5, 21.7], [17.7, 23.6]]);
const laughEye = contour([[16, 19.3], [16.35, 17.4], [22.1, 19.6], [22.7, 20.6], [22.1, 21.6], [17.25, 23.8], [16, 23.1], [19.1, 20.6]], 0.08);
const angryEye = contour([[16.7, 22.2], [16.6, 20.4], [19.5, 21.3], [22.4, 22.2], [22.3, 23.2], [22.2, 24.6], [19.5, 24.4], [16.8, 24.2]], 0.06);
// Eyes have eight cubic segments, including the thin sleepy contour.
const closedEye = contour([[16, 21.6], [17.5, 21.7], [19.5, 22.2], [21.5, 21.7], [23, 21.6], [21.5, 23.1], [19.5, 23.7], [17.5, 23.1]]);
const happyMouth = smile([19.5, 29.6], [24, 33], [28.5, 29.6]);
const neutralBrow = brow([16.8, 17.6], [19.5, 17.6], [22.2, 17.6]);

export interface RobotPose {
  readonly paths: Readonly<Record<"leftEye" | "rightEye" | "leftBrow" | "rightBrow" | "mouth" | "leftPupil" | "rightPupil", FacePath>>;
  readonly eyeColor: string;
  readonly browOpacity: number;
  readonly mouthColor: string;
}

export function robotPose(mood: AiMood): RobotPose {
  let leftEye = roundEye, rightEye = shift(roundEye, 9);
  let leftBrow = neutralBrow, rightBrow = shift(neutralBrow, 9);
  let mouth = oval(24, 31.1, 3.5, 0.9, 12);
  let browOpacity = 0;
  if (mood === "happy" || mood === "proud" || mood === "wink") {
    leftEye = happyEye;
    rightEye = mood === "wink" ? shift(roundEye, 9) : shift(happyEye, 9);
    mouth = happyMouth;
  } else if (mood === "laughing") {
    leftEye = laughEye; rightEye = shift(laughEye, 0, true);
    mouth = oval(24, 31.5, 5.8, 3.3, 12);
  } else if (mood === "angry") {
    leftEye = angryEye; rightEye = shift(angryEye, 0, true);
    leftBrow = brow([16.2, 17.4], [19.3, 18.5], [22.4, 19.6]);
    rightBrow = shift(leftBrow, 0, true); browOpacity = 1;
    mouth = ribbon([[18.8, 32.4], [21.4, 30.4], [24, 32.4], [26.6, 30.4], [29.1, 32.35], [29.2, 32.4]], 1.7);
  } else if (mood === "shocked" || mood === "alarmed") {
    const alarmed = mood === "alarmed";
    leftEye = oval(alarmed ? 19 : 19.2, alarmed ? 21 : 21.2, alarmed ? 4.1 : 3.4, alarmed ? 4.1 : 3.4);
    rightEye = oval(alarmed ? 29 : 28.8, alarmed ? 21 : 21.6, alarmed ? 4.1 : 2.9, alarmed ? 4.1 : 2.9);
    leftBrow = alarmed ? brow([15.4, 15.8], [18.6, 12.8], [22, 15]) : brow([15.8, 16.6], [19, 14.6], [22, 16]);
    rightBrow = alarmed ? shift(leftBrow, 0, true) : brow([26, 17.4], [29, 17.3], [32, 17.2]);
    browOpacity = 1;
    mouth = alarmed ? oval(24, 31.5, 3, 3.1, 12) : smile([19.6, 31.2], [24.6, 32.4], [28.8, 29.4]);
  } else if (mood === "defeated") {
    leftEye = oval(19.5, 22.7, 2.3, 1.7); rightEye = shift(leftEye, 9);
    leftBrow = brow([16.6, 19.4], [19.3, 18.6], [22, 17.8]); rightBrow = shift(leftBrow, 0, true);
    browOpacity = 1; mouth = smile([19.8, 32.6], [24, 29.4], [28.2, 32.6]);
  } else if (mood === "thinking") {
    mouth = oval(25.5, 31, 1.4, 1.4, 12);
  } else if (mood === "smug") {
    leftEye = oval(19.5, 22, 2.7, 1.6); rightEye = shift(leftEye, 9);
    leftBrow = brow([16.4, 19.6], [19.5, 19.4], [22.6, 19.2]); rightBrow = shift(leftBrow, 0, true);
    browOpacity = 0.7; mouth = smile([19.6, 31.2], [24.6, 32.4], [28.8, 29.4]);
  } else if (mood === "nervous") {
    leftEye = oval(21.2, 21.7, 2.2, 2.5); rightEye = shift(leftEye, 8.6);
    mouth = ribbon([[19.4, 31.4], [21.3, 30.8], [23.2, 32], [25.1, 30.8], [27, 32], [29, 31.4]], 1.6);
  } else if (mood === "annoyed") {
    leftEye = oval(19.6, 20.1, 2, 1.5); rightEye = shift(leftEye, 9);
    leftBrow = neutralBrow; rightBrow = shift(leftBrow, 9); browOpacity = 0.8;
    mouth = smile([20, 31.6], [24.2, 31.1], [28.4, 30.6]);
  } else if (mood === "sleepy") {
    leftEye = closedEye; rightEye = shift(closedEye, 9); mouth = oval(24, 31, 1.6, 1.3, 12);
  } else if (mood === "starstruck") {
    mouth = oval(24, 31.6, 5.8, 3.4, 12);
  }
  return {
    paths: { leftEye, rightEye, leftBrow, rightBrow, mouth,
      leftPupil: oval(mood === "alarmed" ? 19 : 19.2, mood === "alarmed" ? 21 : 21.2, 1.3, 1.3),
      rightPupil: oval(mood === "alarmed" ? 29 : 28.8, mood === "alarmed" ? 21 : 21.6, 1.3, 1.3) },
    eyeColor: mood === "angry" ? "#ff5a4f" : mood === "alarmed" ? "#e9f8ff" : "#4fc3ff",
    browOpacity,
    mouthColor: mood === "angry" ? "#ff5a4f" : ["laughing", "starstruck", "alarmed"].includes(mood) ? "#1b2631" : "#5b6874",
  };
}

export function pathData(path: FacePath): string {
  const values = path.points.map(value => Number(value.toFixed(3)));
  let data = `M${values[0]} ${values[1]}`;
  for (let i = 2; i < values.length; i += 6) data += `C${values.slice(i, i + 6).join(" ")}`;
  return data + (path.closed ? "Z" : "");
}

export const MORPH_MS = 420;
// Match the browser's cubic-bezier(.33, 0, .67, 1) exactly on interruption.
// Solve its x coordinate, then evaluate y; this runs once per new mood.
export function betweenPaths(from: FacePath, to: FacePath, progress: number): FacePath {
  const x = Math.min(1, Math.max(0, progress));
  let t = x;
  for (let i = 0; i < 4; i++) {
    const u = 1 - t;
    const value = 0.99 * u * u * t + 2.01 * u * t * t + t * t * t;
    const slope = 0.99 * u * u + 2.04 * u * t + 0.99 * t * t;
    t -= (value - x) / slope;
  }
  const eased = t * t * (3 - 2 * t);
  return { closed: to.closed, points: to.points.map((value, i) => from.points[i]! + (value - from.points[i]!) * eased) };
}
