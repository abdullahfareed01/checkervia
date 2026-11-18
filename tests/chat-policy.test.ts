import { describe, expect, it, vi } from "vitest";
import { localChatLine, turnLine, validChatLine } from "../src/ai/chat";
import { promptForContext, readContext } from "../src/ai/request";
import { readTaunt, requestTaunt } from "../src/ai/taunt";
import { initialBoard } from "../src/engine";
import { createGameState } from "../src/state/gameReducer";
import { chatContext } from "../src/ui/useRemoteTaunt";
import { reactionBubble } from "../src/ui/bubble";
import { bubbleKind } from "../src/ui/useVoice";
import { callProvider } from "../netlify/ai/adapter";
import { FREE_PROVIDERS } from "../netlify/ai/providers";

describe("chat truth, colour and level", () => {
  it.each(["black", "white"] as const)("explicitly identifies the AI as %s and the human as its opposite", humanSide => {
    const state = createGameState({ mode: "vs-ai", humanSide, aiLevel: 4 });
    const context = chatContext(state, "greeting");
    expect(context.player).toBe(humanSide === "black" ? "white" : "black");
    expect(promptForContext(context)).toContain(`The human is ${humanSide === "black" ? "Black" : "White"}`);
    expect(promptForContext(context)).toContain("never sweet");
    expect(promptForContext(context)).toContain("Do not praise");
  });
  it.each([
    "You're playing a strong game, I'm loving the black pieces' clever placement.",
    "Your white pieces look clever.", "I capture your king.", "I will take E3.",
    "My turn now.", "I am winning.", "You won!", "I win!", "It is a draw.",
  ])("rejects mistaken side, turn or result chatter: %s", line => {
    expect(validChatLine(line, { level: 4 })).toBe(false);
  });
  it("Strongest has no unsolicited sweetness, but allows earned grudging respect", () => {
    expect(validChatLine("Well played. That was clever.", { level: 4 })).toBe(false);
    expect(validChatLine("You are really good!", { level: 4 })).toBe(false);
    expect(validChatLine("You are a skilled player.", { level: 4 })).toBe(false);
    expect(validChatLine("Your move, rival!", { level: 4, verdict: null })).toBe(false);
    expect(validChatLine("Well played. That was clever.", { level: 4, verdict: "great" })).toBe(true);
    expect(validChatLine("Bring a real plan, noob.", { level: 4 })).toBe(true);
    expect(validChatLine("Bring a real plan, noob.", { level: 2 })).toBe(false);
    expect(validChatLine("Damn, that was a gift.", { level: 4 })).toBe(false);
    expect(validChatLine("Damn, that was a gift.", { level: 4, verdict: "blunder" })).toBe(true);
  });
  it("ties results and respect to the correct winner", () => {
    expect(validChatLine("You won. Grudging respect.", { level: 4, outcome: "human-win" })).toBe(true);
    expect(validChatLine("You won. Grudging respect.", { level: 4, outcome: "ai-win" })).toBe(false);
    expect(validChatLine("I win. Next challenger.", { level: 4, outcome: "ai-win" })).toBe(true);
    expect(validChatLine("I win. Next challenger.", { level: 4, outcome: "human-win" })).toBe(false);
  });
  it("varies turn and fallback lines, keeping ordinary Strongest remarks sharp", () => {
    for (const level of [1,2,3,4] as const) {
      expect(new Set(Array.from({ length: 8 }, (_, seed) => turnLine("human", level, seed))).size).toBe(8);
      for (let seed = 0; seed < 8; seed++) expect(validChatLine(localChatLine(level, seed), { level })).toBe(true);
    }
    expect(new Set(Array.from({ length: 6 }, (_, seed) => turnLine("ai", 4, seed))).size).toBe(6);
  });
  it("rejects invalid event metadata and keeps chat fields out of move requests", () => {
    const context = { job: "taunt", board: initialBoard(), player: "black", level: 4, opening: false, candidates: [] };
    expect(readContext({ ...context, verdict: "great", outcome: "human-win" })).not.toBeNull();
    expect(readContext({ ...context, verdict: "amazing" })).toBeNull();
    expect(readContext({ ...context, outcome: "unknown" })).toBeNull();
    expect(readContext({ ...context, job: "move", candidates: [0], verdict: "great" })).toBeNull();
  });
  it("client and adapter apply the same Strongest policy", async () => {
    const context = { job: "taunt" as const, board: initialBoard(), player: "black" as const, level: 4 as const, opening: false, candidates: [] };
    const bad = JSON.stringify({ reaction: "Your white pieces look clever." });
    expect(readTaunt(bad, context)).toBeNull();
    expect(await requestTaunt(context, undefined, async () => bad)).toBeNull();
    const send = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: bad } }] })));
    const provider = FREE_PROVIDERS[0]!;
    expect(await callProvider(provider, { [provider.keyEnv]: "test-key" }, "test", "taunt", 0, send, 3500, Date.now, context)).toMatchObject({ ok: false, code: "INVALID_REPLY" });
  });
  it("a draw suppresses the live move bubble, and silent cues/idle lines are not spoken", () => {
    const drawn = { ...createGameState({ mode: "vs-ai" }), drawn: "repetition" as const };
    expect(reactionBubble(drawn, { greeting: "Still playing?" })).toBeNull();
    expect(bubbleKind({ key: "move-2", text: "Your turn.", tone: "banter", why: false, announce: false })).toBeNull();
    expect(bubbleKind({ key: "idle-2-2", text: "Still there?", tone: "banter", why: false, announce: false })).toBeNull();
  });
});
