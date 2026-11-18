// Browser-only fixture for scripts/check-robot.mjs; never imported by the game.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { RobotFace } from "../../src/ui/RobotFace";
import type { AiMood } from "../../src/ui/aiMood";
import "../../src/ui/chrome.css";
import "../../src/ui/bubble.css";

const reactions: readonly (readonly [AiMood, string])[] = [
  ["neutral", "Neutral"], ["happy", "Happy"], ["angry", "Angry"],
  ["laughing", "Laughing"], ["shocked", "Double capture"],
  ["alarmed", "Triple capture"], ["defeated", "Lost"], ["thinking", "Thinking"],
  ["sleepy", "Sleeping (Zzz)"],
];

function Harness() {
  const [mood, setMood] = useState<AiMood>("happy");
  Object.assign(window, { setRobotMood: (next: AiMood) => flushSync(() => setMood(next)) });
  return (
    <main style={{ maxWidth: 520, margin: "24px auto", padding: 16, color: "#f3f6fa", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>Avatar preview</h1>
      <p style={{ lineHeight: 1.5 }}>The eyes, brows and mouth now bend into each expression. Switch quickly between Happy and Angry to check an interrupted transition. Choose Sleeping for the Zzz animation, or leave Lost on to see the sad idle animation.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 24, background: "#1b2631", padding: 20, borderRadius: 16, margin: "20px 0" }}>
        <div style={{ width: 96, height: 96 }}><RobotFace mood={mood} /></div>
        <div style={{ width: 48, height: 48 }}><RobotFace mood={mood} /></div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {reactions.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={mood === value} onClick={() => setMood(value)} style={{ minHeight: 44, padding: "10px 14px", borderRadius: 8, border: "1px solid #627488", background: mood === value ? "#294c66" : "#1b2631", color: "#ffffff", font: "inherit", cursor: "pointer" }}>{label}</button>
        ))}
      </div>
      <p style={{ marginTop: 24 }}><a href="/" style={{ color: "#8ed7ff" }}>Open the game</a></p>
    </main>
  );
}
createRoot(document.getElementById("avatar-root")!).render(<Harness />);
