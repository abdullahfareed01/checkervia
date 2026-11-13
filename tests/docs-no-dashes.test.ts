// No hyphens or dashes in the prose of README.md and the docs (Change 1).
// Code blocks, inline code, link targets and URLs are left out, and so are
// Markdown's own marks (list bullets, table rules). docs/phases holds the
// owner's own requests, quoted as written, so it is left out too.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const docs = readdirSync(new URL("docs/", root), { recursive: true })
  .map((path) => path.split("\\").join("/"))
  .filter((path) => path.endsWith(".md") && !path.startsWith("phases/"))
  .map((path) => `docs/${path}`);
const files = ["README.md", ...docs];

// Hyphens and dashes left in the prose of one file, with their line numbers.
function dashesInProse(text: string): string[] {
  const found: string[] = [];
  let fence = false;
  text.split("\n").forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      fence = !fence;
      return;
    }
    if (fence || /^\s*\|?\s*:?-{3,}/.test(line) || /^\s*-{3,}\s*$/.test(line)) return;
    const prose = line
      .replace(/`[^`]*`/g, " ")
      .replace(/\]\([^)]*\)|https?:\/\/\S+|<[^>]+>/g, " ")
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "");
    const hits = prose.match(/\S*[-‐-―−]\S*/g);
    if (hits) found.push(`${index + 1}: ${hits.join(" ")}`);
  });
  return found;
}

describe("docs prose has no hyphens or dashes", () => {
  it("found the docs", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)("%s", (file) => {
    expect(dashesInProse(readFileSync(new URL(file, root), "utf8"))).toEqual([]);
  });
});
