// One persistent face (D95 follow up): the browser bends matching SVG
// paths between poses. No face swaps, cleanup timers or React frame loop.
import { memo, useMemo } from "react";
import type { AiMood } from "./aiMood";
import { MORPH_MS, pathData, robotPose } from "./robotGeometry";
import type { FacePath } from "./robotGeometry";
import { useRobotMorph } from "./useRobotMorph";

function MorphPath({ name, shape, className, fill, stroke, opacity = 1 }: {
  name: string; shape: FacePath; className?: string; fill: string; stroke?: string; opacity?: number;
}) {
  return (
    <path data-morph={name} className={`robot-morph-path ${className ?? ""}`} d={pathData(shape)} fill={fill} stroke={stroke} strokeWidth={stroke ? 1.5 : undefined} strokeLinecap="round" opacity={opacity}>
      <animate attributeName="d" begin="indefinite" dur={`${MORPH_MS}ms`} calcMode="spline" keyTimes="0;1" keySplines=".33 0 .67 1" fill="remove" />
    </path>
  );
}

function star(cx: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 ? 1.6 : 3.8, angle = -Math.PI / 2 + i * Math.PI / 5;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(21 + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

export const RobotFace = memo(function RobotFace({ mood }: { mood: AiMood }) {
  const pose = useMemo(() => robotPose(mood), [mood]);
  const ref = useRobotMorph(pose.paths);
  const alarmed = mood === "alarmed", surprised = alarmed || mood === "shocked";
  const laughing = mood === "laughing", open = laughing || mood === "starstruck";
  return (
    <svg className={`icon robot-avatar robot-face robot-face-${mood}${mood === "thinking" ? " robot-thinking" : ""}`} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M14 46c0-6 4-10 10-10s10 4 10 10z" fill="#eef2f5" />
      <rect className="robot-chest" x="21" y="39" width="6" height="3" rx="1.5" fill={mood === "angry" ? "#ff5a4f" : "#4fc3ff"} />
      <g className="robot-head">
        <g className="robot-idle">
          <line x1="24" y1="5" x2="24" y2="10" stroke="#c9d3db" strokeWidth="2" strokeLinecap="round" />
          <circle className="robot-light" cx="24" cy="4.5" r="2.6" />
          <rect x="5" y="17" width="5" height="11" rx="2.5" fill="#aeb9c3" />
          <rect x="38" y="17" width="5" height="11" rx="2.5" fill="#aeb9c3" />
          <rect x="9" y="10" width="30" height="25" rx="9" fill="#eef2f5" />
          <rect x="9" y="27" width="30" height="8" rx="4" fill="#d5dde4" />
          <rect x="13" y="14" width="22" height="13" rx="6" fill="#1b2631" />
          <g ref={ref} className={`robot-expression robot-expression-${mood}`}>
            <g className={`robot-eyes${mood === "annoyed" ? " robot-roll" : ""}`}>
              <MorphPath name="leftEye" shape={pose.paths.leftEye} fill={pose.eyeColor} className={mood === "wink" ? "robot-wink" : undefined} opacity={mood === "starstruck" ? 0 : 1} />
              <MorphPath name="rightEye" shape={pose.paths.rightEye} fill={pose.eyeColor} opacity={mood === "starstruck" ? 0 : 1} />
              <g className={`robot-pupils${alarmed ? " robot-alarm-pupils" : ""}`} opacity={surprised ? 1 : 0}>
                <MorphPath name="leftPupil" shape={pose.paths.leftPupil} fill="#1b2631" />
                <MorphPath name="rightPupil" shape={pose.paths.rightPupil} fill="#1b2631" />
              </g>
            </g>
            <g className="robot-brows">
              <MorphPath name="leftBrow" shape={pose.paths.leftBrow} fill="none" stroke={pose.eyeColor} opacity={pose.browOpacity} />
              <MorphPath name="rightBrow" shape={pose.paths.rightBrow} fill="none" stroke={pose.eyeColor} opacity={pose.browOpacity} />
            </g>
            <g className={`robot-mouth-motion${open ? " robot-mouth-open" : ""}${laughing ? " robot-laugh-mouth" : ""}`}>
              <MorphPath name="mouth" shape={pose.paths.mouth} fill={pose.mouthColor} className={alarmed ? "robot-gasp" : mood === "smug" || mood === "shocked" ? "robot-smirk" : undefined} />
              <g className="robot-mouth-detail" opacity={open ? 1 : 0}>
                <path d="M19 28.9 Q24 30.2 29 28.9 L28.5 30.6 Q24 31.4 19.5 30.6 Z" fill="#ffffff" />
                <path d="M20.8 33.7 Q24 31.1 27.2 33.7 Q24 35 20.8 33.7 Z" fill="#ff7b93" />
              </g>
            </g>
            <g className="robot-tears" opacity={laughing ? 1 : 0}>
              <path className="robot-tear" d="M12.2 22.6 q-2.2 3.4 0 4.6 q2.2 -1.2 0 -4.6z" fill="#7fd0ff" />
              <path className="robot-tear" d="M35.8 22.6 q-2.2 3.4 0 4.6 q2.2 -1.2 0 -4.6z" fill="#7fd0ff" />
            </g>
            <g className="robot-sweat-wrap" opacity={alarmed || mood === "nervous" ? 1 : 0}>
              <path className="robot-sweat" d="M37.4 9.6 q-1.8 2.8 0 3.8 q1.8 -1 0 -3.8z" fill="#9fdcff" />
            </g>
            <g className="robot-stars" opacity={mood === "starstruck" ? 1 : 0} fill="#ffd24a"><polygon points={star(19.5)} /><polygon points={star(28.5)} /></g>
            <path className="robot-crown" opacity={mood === "proud" ? 1 : 0} d="M29.5 10.4 L30.4 5.6 L32.6 8.2 L34.4 4.6 L36.2 8.2 L38.4 5.6 L39.3 10.4 Z" fill="#ffd24a" stroke="#b8860b" strokeWidth="0.5" strokeLinejoin="round" />
            <g className="robot-sleep-wrap" opacity={mood === "sleepy" ? 1 : 0}><g className="robot-zz" fill="#9fdcff" fontFamily="Arial, sans-serif" fontWeight="700"><text x="35" y="12" fontSize="5">z</text><text x="38.5" y="7.5" fontSize="6.5">Z</text></g></g>
          </g>
        </g>
      </g>
    </svg>
  );
});
