// The defeated face (owner, 16 Nov 2026): the head droops once, then the
// robot stays sad for good, sighing and glancing around, never jumping back
// to the start of the droop.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bubble = readFileSync(new URL("../src/ui/bubble.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("the defeated robot", () => {
  it("eases into and out of the droop while its continuing sigh stays relative to that pose", () => {
    expect(bubble).toContain(".robot-face-defeated .robot-head {\n  transform: translateY(1.6px) rotate(-5deg);");
    expect(bubble).toContain(".robot-face .robot-head {\n  transition: transform 420ms ease-in-out;");
    expect(bubble).toContain(".robot-face .robot-idle {\n  animation: robot-sulk 5.6s ease-in-out infinite;");
    // Both ends of the loop meet at the same relative resting pose.
    expect(bubble).toMatch(/@keyframes robot-sulk \{\n {2}0%, 100% \{ transform: translateY\(0\) rotate\(0deg\); \}/);
    expect(bubble).not.toContain("robot-droop");
  });

  it("keeps looking here and there with sad eyes, on a loop", () => {
    expect(bubble).toMatch(/\.robot-face \.robot-eyes \{[^}]*animation: robot-sad-look 7s ease-in-out 1\.2s infinite;/);
    // The same clock runs in every mood, so entering sadness cannot
    // reset a half blink or a glance to a different eye position.
    expect(bubble).not.toMatch(/\.robot-expression-[a-z]+ \.robot-eyes \{/);
  });

  it("is still and quiet when the player turns animation off or down", () => {
    expect(bubble).toContain('html[data-anim="off"] .robot-face *,\nhtml[data-anim="reduced"] .robot-face * {\n  animation: none !important;');
  });
});
