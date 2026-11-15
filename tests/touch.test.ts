// Touch polish and the game screen on short phones (D80). The layout itself
// is checked in a real browser (scripts/check-layout.mjs); these tests pin
// the rules that make it work.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read with Unix line ends, whatever the checkout uses.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const touch = read("src/ui/touch.css");
const layout = read("src/ui/layout.css");

describe("touch polish", () => {
  it("is loaded last, so it holds over the other style files", () => {
    const imports = [...read("src/main.tsx").matchAll(/^import "\.\/ui\/([\w-]+\.css)";$/gm)].map((m) => m[1]);
    expect(imports.at(-1)).toBe("touch.css");
  });

  it("turns off the browser's tap highlight for the whole app", () => {
    expect(touch).toMatch(/html \{\n {2}-webkit-tap-highlight-color: transparent;\n\}/);
  });

  it("a long press selects no text and opens no callout, app wide", () => {
    expect(touch).toMatch(/body \{\n {2}-webkit-user-select: none;\n {2}user-select: none;\n {2}-webkit-touch-callout: none;\n\}/);
  });

  it("text fields, the Terms text and the rules text stay selectable", () => {
    const block = touch.match(/input,\ntextarea,\n[^{]+\{[^}]+\}/)![0];
    for (const place of [".terms-scroll", ".rules-body", ".rules-dialog-section"]) expect(block).toContain(place);
    expect(block).toContain("user-select: text;");
    expect(block).toContain("-webkit-touch-callout: default;");
  });

  it("every pressable thing has a pressed state; the board's squares only darken", () => {
    const pressed = touch.match(/:is\(button, a\[href\][^{]+:active:not\(:disabled, \[aria-disabled="true"\]\) \{([^}]+)\}/)!;
    expect(pressed[1]).toContain("filter: brightness(0.86);");
    expect(pressed[1]).toContain("scale: 0.96;");
    expect(touch).toMatch(/\.board :is\(button, \[role="button"\]\):active:not\(:disabled\) \{\n {2}scale: none;\n\}/);
  });
});

describe("the game screen on phones held upright", () => {
  it("sizes the board from the height left after the AI's row, not only the width", () => {
    const boards = [...layout.matchAll(/--board-size: min\(var\(--column-w\), max\(180px, calc\(100dvh - (\d+)px - var\(--text-extra\) - var\(--status-extra, 0px\) - var\(--coach-space, 0px\)\)\)\);/g)];
    expect(boards.map((m) => Number(m[1]))).toEqual([300, 270]);
  });

  it("keeps a fixed slot for the bubble (three lines) and buttons of 44px on short phones", () => {
    const short = layout.slice(layout.indexOf("@media (max-width: 599px) and (max-height: 739px)"));
    expect(short).toContain("--coach-h: 71px;");
    expect(short).toContain("--bar-h: 44px;");
  });
});
