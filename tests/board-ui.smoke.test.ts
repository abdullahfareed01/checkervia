// Render checks for the route overlay, the player cards and the robot icon.
// They draw to HTML; animation timing itself can only be checked by eye.
import { createElement } from "react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Move } from "../src/engine";
import { at, boardFrom } from "../src/engine/testUtils";
import { App } from "../src/ui/App";
import { Board } from "../src/ui/Board";
import { PlayerCard } from "../src/ui/PlayerCard";
import { RouteOverlay } from "../src/ui/RouteOverlay";

const doubleJump: Move = {
  from: at(7, 2),
  to: at(3, 6),
  path: [at(5, 4), at(3, 6)],
  captured: [at(6, 3), at(4, 5)],
};
const step: Move = { from: at(5, 2), to: at(4, 3), path: [at(4, 3)], captured: [] };

describe("RouteOverlay", () => {
  it("draws a line through the start and every landing square", () => {
    const html = renderToStaticMarkup(createElement(RouteOverlay, { move: doubleJump, player: "black" }));
    expect(html).toContain('points="2.5,7.5 4.5,5.5 6.5,3.5"');
    expect(html).toContain("route-black");
  });

  it("numbers the landing squares of a multi jump and crosses out each captured piece", () => {
    const html = renderToStaticMarkup(createElement(RouteOverlay, { move: doubleJump, player: "white" }));
    expect(html.match(/class="route-stop"/g)).toHaveLength(2);
    expect(html.match(/class="route-capture"/g)).toHaveLength(2);
    expect(html).toContain("route-white");
  });

  it("keeps a simple step plain: no numbers, no crosses", () => {
    const html = renderToStaticMarkup(createElement(RouteOverlay, { move: step, player: "black" }));
    expect(html).not.toContain("route-stop");
    expect(html).not.toContain("route-capture");
    expect(html).toContain('points="2.5,5.5 3.5,4.5"');
  });

  it("is ignored by the mouse, so clicks still reach the squares", () => {
    const html = renderToStaticMarkup(createElement(RouteOverlay, { move: step, player: "black" }));
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("Board with a last move", () => {
  const board = boardFrom([
    "........",
    "........",
    "........",
    "......b.",
    "........",
    "........",
    "........",
    "........",
  ]);
  const render = (lastMove: Move | null) =>
    renderToStaticMarkup(
      createElement(Board, {
        view: {
          board,
          selected: null,
          selectable: [],
          mustCapture: [],
          destinations: [],
          routeChoices: [],
          lastMove,
          locked: false,
          previousBoard: null,
          moveKey: 1,
        },
        onSquareClick: () => {},
      }),
    );

  it("shows the route of the last move in the mover's colour", () => {
    const html = render(doubleJump);
    expect(html).toContain("route route-black");
  });

  it("shows no route before the first move", () => {
    expect(render(null)).not.toContain("route-line");
  });

  it("does not render the moving piece on the server (it starts in the browser)", () => {
    expect(render(doubleJump)).not.toContain("ghost-mover");
  });
});

describe("PlayerCard", () => {
  const card = (overrides: Partial<ComponentProps<typeof PlayerCard>> = {}) =>
    renderToStaticMarkup(
      createElement(PlayerCard, {
        player: "white",
        name: "AI",
        robot: true,
        pieces: 9,
        captured: 3,
        toMove: false,
        thinking: false,
        winner: false,
        placement: "top",
        ...overrides,
      }),
    );

  it("shows a robot for the AI and a person for a human", () => {
    expect(card()).toContain("robot-avatar");
    expect(card({ robot: false, name: "You" })).toContain("icon-human");
    expect(card({ robot: false, name: "You" })).not.toContain("robot-avatar");
  });

  it("shows pieces left as a big number", () => {
    expect(card()).toContain('<strong class="card-count">9</strong>');
  });

  it("shows the pieces taken as a small stack of the opponent's colour, and the number", () => {
    const html = card(); // White took 3 black pieces
    expect(html).toContain("Took: 3");
    expect(html.match(/class="mini mini-black"/g)).toHaveLength(3);
  });

  it("draws at most five discs in the stack; the number says the rest", () => {
    const html = card({ captured: 11 });
    expect(html.match(/class="mini mini-black"/g)).toHaveLength(5);
    expect(html).toContain("Took: 11");
  });

  it('says "Your turn" to the person playing the AI, "To move" in two-player games', () => {
    expect(card({ robot: false, name: "You", player: "black", toMove: true })).toContain("Your turn");
    expect(card({ robot: false, name: "Black", player: "black", toMove: true })).toContain("To move");
    expect(card()).toContain("Waiting");
  });

  it("marks the AI with a BOT badge", () => {
    expect(card()).toContain(">BOT<");
    expect(card({ robot: false, name: "You" })).not.toContain(">BOT<");
  });

  it("animates the robot and says so while the AI is thinking", () => {
    const html = card({ thinking: true, toMove: true });
    expect(html).toContain("robot-thinking");
    expect(html).toContain("card-thinking");
    expect(html).toContain("Thinking");
    expect(html).toContain('class="dots"');
  });

  it("shows a crown for the winner, not a green glow", () => {
    const html = card({ winner: true });
    expect(html).toContain("icon-crown");
    expect(card()).not.toContain("icon-crown");
  });

  it("highlights the side to move and the winner", () => {
    expect(card({ toMove: true })).toContain("card-to-move");
    expect(card({ winner: true })).toContain("card-winner");
    expect(card({ winner: true })).toContain("Winner");
  });
});

describe("App layout", () => {
  const html = renderToStaticMarkup(createElement(App));

  it("has the header, the game column with two cards, and the sidebar", () => {
    expect(html).toContain('class="topbar"');
    expect(html).toContain('class="game"');
    expect(html).toContain('class="sidebar"');
    expect(html.match(/class="card /g)).toHaveLength(2);
  });

  it("starts in two-player mode with two people and no robot", () => {
    expect(html).not.toContain("robot-avatar");
    expect(html.match(/icon-human/g)).toHaveLength(2);
  });

  it("puts White's card above the board and Black's below", () => {
    const white = html.indexOf("card-top");
    const board = html.indexOf('aria-label="Checkers board"');
    const black = html.indexOf("card-bottom");
    expect(white).toBeLessThan(board);
    expect(board).toBeLessThan(black);
  });
});
