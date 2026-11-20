// D112: light and dark themes.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, readTheme, setTheme } from "../../src/admin/theme";
import { ThemeSwitch } from "../../src/admin/shell/ThemeSwitch";

const css = (name: string) => readFileSync(`src/admin/styles/${name}`, "utf8");
const declarations = (block: string) => [...block.matchAll(/(--[\w-]+|color-scheme):\s*([^;]+);/g)].map((match) => `${match[1]}:${match[2]!.trim()}`);
function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key), data };
}

afterEach(() => vi.unstubAllGlobals());

describe("the theme choice", () => {
  it("reads Light or Dark, and System otherwise or when storage is blocked", () => {
    vi.stubGlobal("localStorage", storage({ "checkervia-admin-theme": "dark" }));
    expect(readTheme()).toBe("dark");
    vi.stubGlobal("localStorage", storage({ "checkervia-admin-theme": "purple" }));
    expect(readTheme()).toBe("system");
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(readTheme()).toBe("system");
  });
  it("marks the page for Light or Dark and clears it for System", () => {
    const root = { dataset: {} as DOMStringMap };
    applyTheme("dark", root); expect(root.dataset["theme"]).toBe("dark");
    applyTheme("system", root); expect(root.dataset["theme"]).toBeUndefined();
  });
  it("keeps Light or Dark, forgets System, and survives blocked storage", () => {
    const saved = storage();
    vi.stubGlobal("localStorage", saved);
    setTheme("light"); expect(saved.data.get("checkervia-admin-theme")).toBe("light");
    setTheme("system"); expect(saved.data.has("checkervia-admin-theme")).toBe(false);
    vi.stubGlobal("localStorage", { setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(() => setTheme("dark")).not.toThrow();
  });
  it("offers System, Light and Dark as pressed buttons", () => {
    const html = renderToStaticMarkup(createElement(ThemeSwitch));
    for (const label of [">System<", ">Light<", ">Dark<", "Appearance"]) expect(html).toContain(label);
    expect(html).toContain('aria-pressed="true">System<');
    expect(renderToStaticMarkup(createElement(ThemeSwitch, { labelledBy: "heading" }))).not.toContain(">Appearance<");
  });
});

describe("the dark palette", () => {
  const theme = css("refinement.css");
  const media = /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/.exec(theme)?.[1] ?? "";
  const picked = /:root\[data-theme="dark"\] \{([^}]*)\}/.exec(theme)?.[1] ?? "";
  const light = /^:root \{([^}]*)\}/m.exec(theme)?.[1] ?? "";
  it("is the same for the device setting and for picking Dark", () => {
    expect(declarations(media).length).toBeGreaterThan(50);
    expect(declarations(picked)).toEqual(declarations(media));
  });
  it("redefines every colour token of the light palette", () => {
    const names = (block: string) => new Set(declarations(block).map((entry) => entry.split(":")[0]));
    const dark = names(media);
    const missing = [...names(light)].filter((name) => !dark.has(name) && name !== "--adm-sans");
    expect(missing).toEqual([]);
  });
  it("leaves no fixed colours in the page styles that would ignore the theme", () => {
    for (const name of ["overview.css", "chart.css", "lists.css"]) expect(css(name)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
