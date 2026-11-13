// The Menu sheet's mode and level controls, and what the "Why this move?"
// popup says about the level (D44). The tests run without a browser, so the
// sheet's components (plain functions without hooks) are expanded by hand
// and their buttons pressed by calling onClick.
import { createElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AiLevel } from "../src/ai";
import { describeLookahead } from "../src/state/moveFacts";
import { MenuSetup } from "../src/ui/MenuSetup";
import type { MenuRun } from "../src/ui/TopBar";

type Props = { children?: ReactNode; onClick?: () => void; className?: string };

// Every button in the tree, with function components expanded.
function buttons(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<Props>(node)) return [];
  if (typeof node.type === "function") return buttons((node.type as (p: Props) => ReactNode)(node.props));
  return [...(node.type === "button" ? [node] : []), ...buttons(node.props.children)];
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<Props>(node)) return "";
  if (typeof node.type === "function") return text((node.type as (p: Props) => ReactNode)(node.props));
  return text(node.props.children);
}

function setup(mode: "vs-ai" | "two-player", inProgress: boolean) {
  const asked: (string | undefined)[] = [];
  const run: MenuRun = (question, action) => {
    asked.push(question);
    action();
  };
  const onPlayAi = vi.fn<(level: AiLevel) => void>();
  const onTwoPlayers = vi.fn();
  const props = {
    mode,
    level: 2 as AiLevel,
    run,
    loseQuestion: (what: string) => (inProgress ? `${what} The current game will be lost.` : undefined),
    onTwoPlayers,
    onPlayAi,
  };
  const press = (label: string) => buttons(MenuSetup(props)).find((button) => text(button).includes(label))!.props.onClick!();
  return { props, asked, onPlayAi, onTwoPlayers, press };
}

describe("Menu sheet: mode and level", () => {
  it("shows the mode and the four levels with their one-line meaning, the current level chosen", () => {
    const html = renderToStaticMarkup(createElement(MenuSetup, setup("vs-ai", false).props));
    expect(html).toContain("Mode");
    expect(html).toContain("Two Players");
    expect(html).toContain("AI level");
    expect(html.match(/role="radio"/g)).toHaveLength(4);
    expect(html).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Medium/);
    expect(html).toContain("Looks 6 turns ahead (3 moves each)");
  });

  it("choosing another level during a game asks first, then starts a new game at it", () => {
    const menu = setup("vs-ai", true);
    menu.press("Hard");
    expect(menu.asked).toEqual(["Start a new game against the Hard AI? The current game will be lost."]);
    expect(menu.onPlayAi).toHaveBeenCalledWith(3);
  });

  it("before the first move it starts at once", () => {
    const menu = setup("vs-ai", false);
    menu.press("Strongest");
    expect(menu.asked).toEqual([undefined]);
    expect(menu.onPlayAi).toHaveBeenCalledWith(4);
  });

  it("the level already playing just closes the sheet", () => {
    const menu = setup("vs-ai", true);
    menu.press("Medium");
    expect(menu.asked).toEqual([undefined]);
    expect(menu.onPlayAi).not.toHaveBeenCalled();
  });

  it("in a two-player game, a level starts a game against the AI at it", () => {
    const menu = setup("two-player", false);
    menu.press("Easy");
    expect(menu.onPlayAi).toHaveBeenCalledWith(1);
  });

  it("switching modes asks first during a game", () => {
    const menu = setup("vs-ai", true);
    menu.press("Two Players");
    expect(menu.asked).toEqual(["Switch to Two Players? The current game will be lost."]);
    expect(menu.onTwoPlayers).toHaveBeenCalled();
  });
});

describe("the popup says what the AI got at its level", () => {
  const base = { depth: 4, score: 100, best: 100, offered: 4, legal: 9, scoresShown: true };

  it("the best few of the legal moves", () => {
    expect(describeLookahead(base, 3)[0]!.text).toBe("Hard level: the engine looked 4 turns ahead and offered the AI its best 4 of 9 moves.");
  });

  it("every move at Easy, in the singular for 1 turn", () => {
    const easy = describeLookahead({ ...base, depth: 1, offered: 9 }, 1);
    expect(easy[0]!.text).toBe("Easy level: the engine looked 1 turn ahead and offered the AI all 9 legal moves.");
    expect(easy[1]!.text).toBe("Looking 1 turn ahead, the engine scored this move +1.0.");
  });

  it("an Easy slip says so", () => {
    expect(describeLookahead({ ...base, depth: 1, scoresShown: false }, 1)[0]!.text).toBe(
      "Easy level: a deliberate slip. The AI chose without the engine's scores this time.",
    );
  });
});

describe("one legal move reads naturally", () => {
  it("says its only legal move, not all 1 legal moves", () => {
    const only = describeLookahead({ depth: 2, score: 100, best: 100, offered: 1, legal: 1, scoresShown: true }, 2);
    expect(only[0]!.text).toBe("Medium level: the engine looked 2 turns ahead and offered the AI its only legal move.");
  });
});
