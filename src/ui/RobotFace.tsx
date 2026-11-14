// The AI's robot with a face that shows its mood (D64, more moods D71), on the AI card and
// next to its chat bubble. The same white robot as before (dark visor, blue
// eyes); the eyes, the mouth and the antenna light change with the mood,
// and the head bounces when it laughs (with a tear) and shakes when it is
// angry (only at the Standard and Cinematic animation levels, never with
// reduced motion).
import type { AiMood } from "./aiMood";

const EYE = "#4fc3ff";
const GOLD = "#ffd24a";

/** A five pointed star's points, for the starstruck eyes. */
function star(cx: number, cy: number, outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}
const ANGRY = "#ff5a4f";
const MOUTH = "#5b6874";

function Eyes({ mood }: { mood: AiMood }) {
  if (mood === "happy") {
    return (
      <g className="robot-eyes" fill="none" stroke={EYE} strokeWidth="2.2" strokeLinecap="round">
        <path d="M16.8 23 Q19.5 18.6 22.2 23" />
        <path d="M25.8 23 Q28.5 18.6 31.2 23" />
      </g>
    );
  }
  if (mood === "laughing") {
    return (
      <g className="robot-eyes">
        <g fill="none" stroke={EYE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16.8 18.4 L21.6 20.6 L16.8 22.8" />
          <path d="M31.2 18.4 L26.4 20.6 L31.2 22.8" />
        </g>
        <path className="robot-tear" d="M12.2 22.6 q-2.2 3.4 0 4.6 q2.2 -1.2 0 -4.6z" fill="#7fd0ff" />
        <path className="robot-tear" d="M35.8 22.6 q-2.2 3.4 0 4.6 q2.2 -1.2 0 -4.6z" fill="#7fd0ff" />
      </g>
    );
  }
  if (mood === "shocked") {
    // Wide eyes, but one brow up and a smirk below: surprised, not scared.
    return (
      <g className="robot-eyes">
        <path d="M15.8 16.6 Q19 14.6 22 16" fill="none" stroke={EYE} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M26 17.4 L32 17.2" fill="none" stroke={EYE} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="19.2" cy="21.2" r="3.4" fill={EYE} />
        <circle cx="28.8" cy="21.6" r="2.9" fill={EYE} />
        <circle cx="19.2" cy="21.2" r="1.3" fill="#1b2631" />
        <circle cx="28.8" cy="21.6" r="1.1" fill="#1b2631" />
        <circle cx="20.2" cy="20.1" r="0.7" fill="#ffffff" />
      </g>
    );
  }
  if (mood === "angry") {
    return (
      <g className="robot-eyes">
        <g stroke={ANGRY} strokeWidth="1.8" strokeLinecap="round">
          <path d="M16.2 17.4 L22.4 19.6" />
          <path d="M31.8 17.4 L25.6 19.6" />
        </g>
        <path d="M16.6 20.4 L22.4 22.2 L22.2 24.6 L16.8 24.2 Z" fill={ANGRY} />
        <path d="M31.4 20.4 L25.6 22.2 L25.8 24.6 L31.2 24.2 Z" fill={ANGRY} />
      </g>
    );
  }
  if (mood === "smug") {
    // Half closed eyes looking down at you: winning, and it knows it.
    return (
      <g className="robot-eyes">
        <path d="M16.8 20.6 H22.2 V21.8 A2.7 2.4 0 0 1 16.8 21.8 Z" fill={EYE} />
        <path d="M25.8 20.6 H31.2 V21.8 A2.7 2.4 0 0 1 25.8 21.8 Z" fill={EYE} />
        <path d="M16.4 19.6 L22.6 19.2 M25.4 19.2 L31.6 19.6" stroke={EYE} strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
      </g>
    );
  }
  if (mood === "nervous") {
    // Eyes sliding to the side and a bead of sweat: losing, pretending not to care.
    return (
      <g className="robot-eyes">
        <rect className="robot-eye-blue" x="19" y="19.2" width="4.4" height="5" rx="2.2" />
        <rect className="robot-eye-blue" x="27.6" y="19.2" width="4.4" height="5" rx="2.2" />
        <path className="robot-sweat" d="M37.4 9.6 q-1.8 2.8 0 3.8 q1.8 -1 0 -3.8z" fill="#9fdcff" />
      </g>
    );
  }
  if (mood === "defeated") {
    // Sad brows and low eyes: it lost, and it sulks.
    return (
      <g className="robot-eyes">
        <path d="M16.6 19.4 L22 17.8 M31.4 19.4 L26 17.8" stroke={EYE} strokeWidth="1.5" strokeLinecap="round" />
        <rect className="robot-eye-blue" x="17.2" y="21" width="4.6" height="3.4" rx="1.7" />
        <rect className="robot-eye-blue" x="26.2" y="21" width="4.6" height="3.4" rx="1.7" />
      </g>
    );
  }
  if (mood === "wink") {
    return (
      <g className="robot-eyes">
        <path className="robot-wink" d="M16.8 21.6 Q19.5 19.2 22.2 21.6" fill="none" stroke={EYE} strokeWidth="2.2" strokeLinecap="round" />
        <rect className="robot-eye-blue" x="26" y="18.5" width="5" height="5.5" rx="2.5" />
      </g>
    );
  }
  if (mood === "starstruck") {
    return (
      <g className="robot-eyes robot-stars">
        <polygon points={star(19.5, 21, 3.8, 1.6)} fill={GOLD} />
        <polygon points={star(28.5, 21, 3.8, 1.6)} fill={GOLD} />
      </g>
    );
  }
  if (mood === "proud") {
    // Eyes closed with pleasure, chin up, and a small crown on its head.
    return (
      <g className="robot-eyes">
        <path d="M16.8 22.4 Q19.5 18.8 22.2 22.4 M25.8 22.4 Q28.5 18.8 31.2 22.4" fill="none" stroke={EYE} strokeWidth="2.2" strokeLinecap="round" />
        <path className="robot-crown" d="M29.5 10.4 L30.4 5.6 L32.6 8.2 L34.4 4.6 L36.2 8.2 L38.4 5.6 L39.3 10.4 Z" fill={GOLD} stroke="#b8860b" strokeWidth="0.5" strokeLinejoin="round" />
      </g>
    );
  }
  if (mood === "annoyed") {
    // An eye roll: the eyes look up under flat lids.
    return (
      <g className="robot-eyes robot-roll">
        <path d="M16.6 17.6 H22.4 M25.6 17.6 H31.4" stroke={EYE} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
        <rect className="robot-eye-blue" x="17.6" y="18.6" width="4" height="3" rx="1.5" />
        <rect className="robot-eye-blue" x="26.6" y="18.6" width="4" height="3" rx="1.5" />
      </g>
    );
  }
  if (mood === "sleepy") {
    return (
      <g className="robot-eyes">
        <path d="M16.8 21.6 Q19.5 23.4 22.2 21.6 M25.8 21.6 Q28.5 23.4 31.2 21.6" fill="none" stroke={EYE} strokeWidth="1.8" strokeLinecap="round" />
        <g className="robot-zz" fill="#9fdcff" fontFamily="Arial, sans-serif" fontWeight="700">
          <text x="35" y="12" fontSize="5">z</text>
          <text x="38.5" y="7.5" fontSize="6.5">Z</text>
        </g>
      </g>
    );
  }
  // Neutral and thinking: the round blue eyes (they scan while thinking).
  return (
    <g className="robot-eyes">
      <rect className="robot-eye-blue" x="17" y="18.5" width="5" height="5.5" rx="2.5" />
      <rect className="robot-eye-blue" x="26" y="18.5" width="5" height="5.5" rx="2.5" />
    </g>
  );
}

function Mouth({ mood }: { mood: AiMood }) {
  if (mood === "happy" || mood === "wink" || mood === "proud") {
    return <path d="M19.5 29.6 Q24 33 28.5 29.6" fill="none" stroke={MOUTH} strokeWidth="1.8" strokeLinecap="round" />;
  }
  if (mood === "starstruck") {
    return (
      <g className="robot-mouth-open">
        <path d="M18.2 28.8 H29.8 Q29.8 35 24 35 Q18.2 35 18.2 28.8 Z" fill="#1b2631" />
        <path d="M19.4 29.2 H28.6 V30.2 H19.4 Z" fill="#ffffff" />
      </g>
    );
  }
  if (mood === "annoyed") return <path d="M20 31.6 L28.4 30.6" fill="none" stroke={MOUTH} strokeWidth="1.8" strokeLinecap="round" />;
  if (mood === "sleepy") return <ellipse cx="24" cy="31" rx="1.6" ry="1.3" fill={MOUTH} />;
  if (mood === "laughing") {
    return (
      <g className="robot-mouth-open">
        <path d="M18.6 28.8 H29.4 Q29.4 34.6 24 34.6 Q18.6 34.6 18.6 28.8 Z" fill="#1b2631" />
        <path d="M21 33.4 Q24 31 27 33.4 Q24 34.8 21 33.4 Z" fill="#ff7b93" />
      </g>
    );
  }
  if (mood === "angry") {
    return <path d="M18.8 32.4 L21.4 30.4 L24 32.4 L26.6 30.4 L29.2 32.4" fill="none" stroke={ANGRY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (mood === "thinking") return <circle cx="25.5" cy="31" r="1.4" fill={MOUTH} />;
  if (mood === "shocked" || mood === "smug") {
    return <path className="robot-smirk" d="M19.6 31.2 Q24.6 32.4 28.8 29.4" fill="none" stroke={MOUTH} strokeWidth="1.8" strokeLinecap="round" />;
  }
  if (mood === "nervous") {
    return <path d="M19.4 31.4 q1.2 -1.2 2.4 0 t2.4 0 t2.4 0 t2.4 0" fill="none" stroke={MOUTH} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (mood === "defeated") return <path d="M19.8 32.6 Q24 29.4 28.2 32.6" fill="none" stroke={MOUTH} strokeWidth="1.8" strokeLinecap="round" />;
  return <rect x="20.5" y="30.2" width="7" height="1.8" rx="0.9" fill={MOUTH} />;
}

export function RobotFace({ mood }: { mood: AiMood }) {
  return (
    <svg className={`icon robot-avatar robot-face robot-face-${mood}${mood === "thinking" ? " robot-thinking" : ""}`} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M14 46c0-6 4-10 10-10s10 4 10 10z" fill="#eef2f5" />
      <rect className="robot-chest" x="21" y="39" width="6" height="3" rx="1.5" fill={mood === "angry" ? ANGRY : EYE} />
      {/* The head moves on its own: a bounce for a laugh, a shake for anger. */}
      <g className="robot-head">
        <line x1="24" y1="5" x2="24" y2="10" stroke="#c9d3db" strokeWidth="2" strokeLinecap="round" />
        <circle className="robot-light" cx="24" cy="4.5" r="2.6" />
        <rect x="5" y="17" width="5" height="11" rx="2.5" fill="#aeb9c3" />
        <rect x="38" y="17" width="5" height="11" rx="2.5" fill="#aeb9c3" />
        <rect x="9" y="10" width="30" height="25" rx="9" fill="#eef2f5" />
        <rect x="9" y="27" width="30" height="8" rx="4" fill="#d5dde4" />
        <rect x="13" y="14" width="22" height="13" rx="6" fill="#1b2631" />
        {/* A new face pops in when the mood changes (the key remounts it). */}
        <g key={mood} className="robot-expression">
          <Eyes mood={mood} />
          <Mouth mood={mood} />
        </g>
      </g>
    </svg>
  );
}
