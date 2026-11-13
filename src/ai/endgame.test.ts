// Engine facts for the end of the game (Change 4): the proof behind the
// resign hint, and the tips after the AI wins, for known positions.
import { describe, expect, it } from "vitest";
import { boardFrom } from "../engine/testUtils";
import { getLegalMoves } from "../engine";
import type { Board } from "../engine";
import type { Analyze } from "./analyzer";
import { PROOF_DEPTH, gameTips, provenLost } from "./endgame";
import { WIN } from "./search";

const EMPTY = "........";
const board = (rows: Record<number, string>): Board => boardFrom(Array.from({ length: 8 }, (_, row) => rows[row] ?? EMPTY));

// Black's only piece on A1 must step to B2, where White's King on C3 jumps it.
const lost = board({ 5: "..W.....", 7: "b......." });
// Black (you) can step E3 -> D4 next to White's C5, which then jumps it.
const trap = board({ 0: ".......w", 3: "..w.....", 5: "....b...", 7: "b......." });

describe("provenLost (the resign hint)", () => {
  it("is true when the real search proves every move loses by force", async () => {
    expect(await provenLost(lost, "black")).toBe(true);
  });

  it("is false in an ordinary position, and at the start", async () => {
    expect(await provenLost(trap, "black")).toBe(false);
  });

  it("is never guessed: one move that is not a forced loss, a shallower search, an error or no moves all mean false", async () => {
    const moves = getLegalMoves(trap, "black").length;
    const allLost: Analyze = async () => ({ depth: PROOF_DEPTH, scores: Array(moves).fill(-(WIN - 3)) });
    const oneHolds: Analyze = async () => ({ depth: PROOF_DEPTH, scores: [0, ...Array(moves - 1).fill(-(WIN - 3))] });
    const shallow: Analyze = async () => ({ depth: 2, scores: Array(moves).fill(-(WIN - 3)) });
    const broken: Analyze = async () => {
      throw new Error("worker died");
    };
    expect(await provenLost(trap, "black", allLost)).toBe(true);
    expect(await provenLost(trap, "black", oneHolds)).toBe(false);
    expect(await provenLost(trap, "black", shallow)).toBe(false);
    expect(await provenLost(trap, "black", broken)).toBe(false);
    expect(await provenLost(board({ 0: ".w......" }), "black")).toBe(false);
  });
});

describe("gameTips", () => {
  const blunder = getLegalMoves(trap, "black").find((move) => move.to.row === 4 && move.to.col === 3)!;

  it("names the move that cost the most, the better move and the pieces it cost", async () => {
    const tips = await gameTips([{ board: trap, move: blunder, player: "black", number: 1 }], { player: 0, ai: 0 });
    expect(tips[0]!.kind).toBe("costliest");
    expect(tips[0]!.text).toMatch(/^Move 1: you played E3 → D4, and it cost you about 1\.0 piece\. (E3 → F4|A1 → B2) was better\.$/);
  });

  it("names a missed forced win", async () => {
    const moves = getLegalMoves(trap, "black");
    const played = moves[1]!;
    const fake: Analyze = async () => ({ depth: 4, scores: moves.map((_, i) => (i === 0 ? WIN - 3 : 0)) });
    const tips = await gameTips([{ board: trap, move: played, player: "black", number: 7 }], { player: 0, ai: 0 }, fake);
    expect(tips.find((tip) => tip.kind === "missedWin")?.text).toMatch(/^Move 7: .+ won by force in 3 turns\. You played .+\.$/);
  });

  it("matches the general tip to the game: Kings, or the default", async () => {
    const kings = await gameTips([], { player: 0, ai: 2 });
    expect(kings).toEqual([{ kind: "general", text: "The AI made 2 Kings and you made 0. Guard your back row and race for the far row." }]);
    const plain = await gameTips([], { player: 1, ai: 1 });
    expect(plain[0]!.text).toBe("Trade pieces when you are ahead, and avoid trades when you are behind.");
  });

  it("gives at most three tips, with no hyphens or dashes", async () => {
    const tips = await gameTips([{ board: trap, move: blunder, player: "black", number: 1 }], { player: 0, ai: 3 });
    expect(tips.length).toBeLessThanOrEqual(3);
    for (const tip of tips) expect(tip.text).not.toMatch(/[-‐-―]/);
  });

  it("invents nothing when the search fails", async () => {
    const broken: Analyze = async () => {
      throw new Error("no");
    };
    const tips = await gameTips([{ board: trap, move: blunder, player: "black", number: 1 }], { player: 0, ai: 0 }, broken);
    expect(tips.map((tip) => tip.kind)).toEqual(["general"]);
  });
});
