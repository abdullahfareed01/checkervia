// AI reactions end to end: the engine judges the player's move, the prompt
// asks for a line only when it is remarkable, and the reaction travels into
// the game state, the speech bubble and the "Why this move?" facts.
import { describe, expect, it, vi } from "vitest";
import { boardFrom, getLegalMoves, initialBoard } from "../src/engine";
import type { Board } from "../src/engine";
import { chooseMove } from "../src/ai/chooseMove";
import type { CallModel } from "../src/ai/chooseMove";
import { fallbackLine } from "../src/ai/language";
import { parseReply } from "../src/ai/parseReply";
import { buildPrompt } from "../src/ai/prompt";
import { startAiTurn } from "../src/state/aiController";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction, GameState } from "../src/state/gameReducer";
import { displayedPosition } from "../src/state/history";
import { reactionBubble } from "../src/ui/bubble";
import { explainShown } from "../src/ui/useAiExplanation";

const EMPTY = "........";
const board = (rows: Record<number, string>): Board =>
  boardFrom(Array.from({ length: 8 }, (_, row) => rows[row] ?? EMPTY));
const click = (row: number, col: number): GameAction => ({ type: "click", position: { row, col } });

// Black (you) can step E3 -> D4, next to White's C5, which then jumps it: a
// blunder. E3 -> F4 or A1 -> B2 are safe.
const trap = board({ 0: ".......w", 3: "..w.....", 5: "....b...", 7: "b......." });

function modelReplying(text: string) {
  const prompts: string[] = [];
  const callModel: CallModel = async (prompt) => {
    prompts.push(prompt);
    return text;
  };
  return { callModel, prompts };
}

// Runs one AI turn on `state` and returns the state after the AI's move.
async function aiTurn(state: GameState, reply: string) {
  const { callModel, prompts } = modelReplying(reply);
  const actions: GameAction[] = [];
  startAiTurn(state, callModel, (action) => actions.push(action));
  await vi.waitFor(() => expect(actions).toHaveLength(1), { timeout: 10_000 });
  return { after: gameReducer(state, actions[0]!), action: actions[0]!, prompt: prompts[0]! };
}

describe("prompt v5: the reaction", () => {
  const moves = getLegalMoves(initialBoard(), "black");

  it("Easy, Medium, Hard: asks for a clean, playful line about any move (D45)", () => {
    const prompt = buildPrompt(initialBoard(), "black", moves, undefined, { label: "C3 -> D4", judgement: null });
    expect(prompt).toContain("Your opponent's last move was C3 -> D4. The game engine found nothing special about it.");
    expect(prompt).toContain("friendly, playful checkers rival");
    expect(prompt).toContain("No swearing, no insults, no name calling.");
    expect(prompt).not.toContain("trash-talking");
    expect(prompt).toContain("Keep it about the game: no slurs, no hate");
    expect(prompt).toContain("Do not use hyphens, em dashes or en dashes: write compound words as separate words or as one word");
  });

  it("Strongest: asks for trash talk in a cocky rival's voice, swearing only after a blunder", () => {
    const prompt = buildPrompt(initialBoard(), "black", moves, undefined, { label: "C3 -> D4", judgement: null, strongLanguage: true });
    expect(prompt).toContain("cocky, trash-talking checkers rival");
    expect(prompt).toContain("Mild swearing (damn, hell, crap, shit) only when the engine judged their move a blunder");
    expect(prompt).toContain("Never the f-word or anything stronger.");
    expect(prompt).toContain("Keep it about the game: no slurs, no hate");
  });

  it("before the first move there is nothing to react to", () => {
    expect(buildPrompt(initialBoard(), "black", moves)).toContain("This is the first move of the game");
  });

  const blunder = {
    label: "E3 -> D4",
    judgement: { verdict: "blunder" as const, detail: "It loses about 1.0 piece compared with the best move (E3 -> F4)." },
  };
  const great = { label: "C1 -> E3 -> G5", judgement: { verdict: "great" as const, detail: "It is a multi jump that takes 2 pieces." } };

  it("after a blunder: a light tease, or a roast at Strongest, with the engine's facts", () => {
    const clean = buildPrompt(initialBoard(), "black", moves, undefined, blunder);
    expect(clean).toContain("Your opponent's last move was E3 -> D4. The game engine judged it a blunder");
    expect(clean).toContain("Tease them lightly about it.");
    expect(buildPrompt(initialBoard(), "black", moves, undefined, { ...blunder, strongLanguage: true })).toContain("Roast them for it.");
  });

  it("after a great move: praise, or grudging respect at Strongest", () => {
    const clean = buildPrompt(initialBoard(), "black", moves, undefined, great);
    expect(clean).toContain("an excellent move");
    expect(clean).toContain("Praise them for it, with a playful dig.");
    expect(buildPrompt(initialBoard(), "black", moves, undefined, { ...great, strongLanguage: true })).toContain("grudging respect");
  });

  it("puts the reaction instruction before the move list, which stays last", () => {
    const prompt = buildPrompt(initialBoard(), "black", moves, undefined, { label: "x", judgement: null });
    expect(prompt.indexOf("checkers rival")).toBeGreaterThan(0);
    expect(prompt.indexOf("checkers rival")).toBeLessThan(prompt.indexOf("Legal moves:"));
    expect(prompt.trimEnd().endsWith(`${moves.length}: G3 -> H4`)).toBe(true);
  });
});

describe("parseReply reads the reaction", () => {
  it("returns it as tidy plain text", () => {
    expect(parseReply('{"move": 1, "reason": "Safe.", "reaction": "  Oops, that one was free! "}', 3)).toEqual({
      ok: true,
      number: 1,
      reason: "Safe.",
      reaction: "Oops, that one was free!",
    });
  });

  it("treats an empty reaction as none", () => {
    expect(parseReply('{"move": 1, "reason": "Safe.", "reaction": ""}', 3)).toEqual({ ok: true, number: 1, reason: "Safe." });
  });
});

describe("chooseMove keeps a reaction whenever there was a move to react to", () => {
  const reply = '{"move": 1, "reason": "Develop.", "reaction": "Nice one!"}';

  it("drops it at the start of the game (no move to react to)", async () => {
    const { callModel } = modelReplying(reply);
    const result = await chooseMove(initialBoard(), "black", callModel);
    expect(result.ok && "reaction" in result).toBe(false);
  });

  it("keeps it after an ordinary move too", async () => {
    const { callModel } = modelReplying(reply);
    const result = await chooseMove(initialBoard(), "black", callModel, 3, { opponent: { label: "x", judgement: null } });
    expect(result).toMatchObject({ ok: true, reaction: "Nice one!" });
  });

  it("keeps it after a remarkable move", async () => {
    const { callModel } = modelReplying(reply);
    const result = await chooseMove(initialBoard(), "black", callModel, 3, {
      opponent: { label: "x", judgement: { verdict: "great", detail: "d" } },
    });
    expect(result).toMatchObject({ ok: true, reaction: "Nice one!" });
  });
});

describe("a blunder against the AI, end to end", () => {
  const blundered = [click(5, 4), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai", board: trap }));

  it("is judged by the engine, mentioned in the prompt, and the reaction is stored with the AI's move", async () => {
    expect(blundered.aiPhase).toBe("thinking");
    const { after, action, prompt } = await aiTurn(
      blundered,
      '{"move": 1, "reason": "Free piece.", "reaction": "Oops, you left D4 all alone!"}',
    );

    expect(prompt).toContain("Your opponent's last move was E3 -> D4. The game engine judged it a blunder");
    expect(action).toMatchObject({ type: "aiMoved", reaction: "Oops, you left D4 all alone!", judgement: { verdict: "blunder" } });

    const entry = after.history.at(-1)!;
    expect(entry.reaction).toBe("Oops, you left D4 all alone!");
    expect(entry.judgement?.verdict).toBe("blunder");

    const explanation = explainShown(after.mode, displayedPosition(after))!;
    expect(explanation.reaction).toBe("Oops, you left D4 all alone!");
    expect(explanation.facts[0]).toMatchObject({ tone: "bad" });
    expect(explanation.facts[0]!.text).toContain("Your previous move: a blunder.");
  });

  it("an ordinary move gets trash talk too, but no engine verdict", async () => {
    const calm = [click(7, 0), click(6, 1)].reduce(gameReducer, createGameState({ mode: "vs-ai", board: trap }));
    const { after, prompt } = await aiTurn(calm, '{"move": 1, "reason": "Waiting.", "reaction": "Is that your big plan?"}');
    expect(prompt).toContain("found nothing special");
    expect(after.history.at(-1)!.reaction).toBe("Is that your big plan?");
    expect(after.history.at(-1)).not.toHaveProperty("judgement");
    const explanation = explainShown(after.mode, displayedPosition(after))!;
    expect(explanation.reaction).toBe("Is that your big plan?");
    expect(explanation.facts.some((fact) => fact.text.startsWith("Your previous move"))).toBe(false);
  });

  it("an empty reaction shows nothing", async () => {
    const calm = [click(7, 0), click(6, 1)].reduce(gameReducer, createGameState({ mode: "vs-ai", board: trap }));
    const { after } = await aiTurn(calm, '{"move": 1, "reason": "Waiting.", "reaction": ""}');
    expect(after.history.at(-1)).not.toHaveProperty("reaction");
  });
});

describe("the chat bubble shows the reaction, in the colour of the engine's verdict", () => {
  it("roast after a blunder, banter after an ordinary move", async () => {
    const blunder = [click(5, 4), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai", board: trap }));
    const { after } = await aiTurn(blunder, '{"move": 1, "reason": "x", "reaction": "Thanks for the gift."}');
    expect(reactionBubble(after, 0)).toEqual({ key: `move-${after.history.length - 1}`, text: "Thanks for the gift.", tone: "roast", why: true });

    const calm = [click(5, 4), click(4, 5)].reduce(gameReducer, createGameState({ mode: "vs-ai", board: trap }));
    const ordinary = await aiTurn(calm, '{"move": 1, "reason": "x", "reaction": "Bold."}');
    expect(reactionBubble(ordinary.after, 0)?.tone).toBe("banter");
  });
});

describe("trash talk stays fresh", () => {
  const moves = getLegalMoves(initialBoard(), "black");

  it("shows the AI its last lines and asks for something new", () => {
    const prompt = buildPrompt(initialBoard(), "black", moves, undefined, {
      label: "C3 -> D4",
      judgement: null,
      recentLines: ["Is that your big plan?", "Pathetic."],
    });
    expect(prompt).toContain('Your last lines were: "Is that your big plan?", "Pathetic.". Say something new');
    expect(prompt).toContain('never open with "Nice try"');
    expect(prompt).toContain("never pawns");
  });

  it("the AI turn passes on its last three lines", async () => {
    // Two AI turns in the trap position's game; the second prompt quotes the first line.
    const first = [click(7, 0), click(6, 1)].reduce(gameReducer, createGameState({ mode: "vs-ai", board: trap }));
    const { after } = await aiTurn(first, '{"move": 1, "reason": "Waiting.", "reaction": "Is that your big plan?"}');
    const human = after.legalMoves[0]!;
    const next = [click(human.from.row, human.from.col), click(human.to.row, human.to.col)].reduce(gameReducer, after);
    if (next.aiPhase !== "thinking") return; // the game ended; nothing more to check
    const { prompt } = await aiTurn(next, '{"move": 1, "reason": "x", "reaction": ""}');
    expect(prompt).toContain('Your last lines were: "Is that your big plan?"');
  });
});

describe("language rules through a whole AI turn (D45)", () => {
  // E3 -> D4 is a blunder in the trap position; E3 -> F4 is safe.
  const after = (level: 1 | 2 | 3 | 4, to: [number, number]) =>
    [click(5, 4), click(to[0], to[1])].reduce(gameReducer, createGameState({ mode: "vs-ai", board: trap, aiLevel: level }));
  const reply = (reaction: string) => JSON.stringify({ move: 1, reason: "Takes the piece.", reaction });

  it("Strongest after a verified blunder: mild swearing is shown, and the prompt was the strong one", async () => {
    const { after: state, prompt } = await aiTurn(after(4, [4, 3]), reply("Damn, you just handed me a piece."));
    expect(prompt).toContain("cocky, trash-talking checkers rival");
    expect(state.history.at(-1)!.reaction).toBe("Damn, you just handed me a piece.");
  });

  it("Strongest after an ordinary move: swearing is replaced with a clean line", async () => {
    const { after: state } = await aiTurn(after(4, [4, 5]), reply("That was a shit move."));
    expect(state.history.at(-1)!.reaction).not.toMatch(/shit/);
    expect(state.history.at(-1)!.reaction).toMatch(/\.$/);
  });

  it.each([1, 2, 3] as const)("level %i: the prompt is clean, and swearing is replaced even after a blunder", async (level) => {
    const { after: state, prompt } = await aiTurn(after(level, [4, 3]), reply("Damn, you idiot."));
    expect(prompt).not.toContain("trash-talking");
    expect(state.history.at(-1)!.reaction).toBe(fallbackLine("blunder", "Damn, you idiot.".length));
  });

  it("the hard line is replaced at Strongest too", async () => {
    const { after: state } = await aiTurn(after(4, [4, 3]), reply("Your mom plays better, damn."));
    expect(state.history.at(-1)!.reaction).not.toMatch(/mom|damn/i);
  });

  it("dashes are taken out of what the AI says", async () => {
    const { after: state } = await aiTurn(after(2, [4, 5]), JSON.stringify({ move: 1, reason: "Guards the back-row.", reaction: "Bold—but risky." }));
    expect(state.history.at(-1)).toMatchObject({ reason: "Guards the back row.", reaction: "Bold, but risky." });
  });
});
