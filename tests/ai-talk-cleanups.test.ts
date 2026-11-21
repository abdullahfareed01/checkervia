// D162: the move prompt says "first move of the game" only when it is, a
// rematch is a game after a finished one, and talk has its own rate budget,
// so chat lines can never push a move onto the engine fallback.
import { describe, expect, it, vi } from "vitest";
import { handleAiMove } from "../netlify/aiMoveHandler";
import { createCooldownStore } from "../netlify/ai/cooldowns";
import { FREE_PROVIDERS } from "../netlify/ai/providers";
import type { Env } from "../netlify/ai/providers";
import { createRateLimiter } from "../netlify/rateLimiter";
import { promptForContext } from "../src/ai/request";
import type { ModelContext } from "../src/ai/request";
import { applyMove, getLegalMoves, initialBoard } from "../src/engine";
import { trackRematch } from "../src/ui/useRemoteTaunt";

describe("the first move of the game (D162)", () => {
  it("is named only on the starting position with Black to move", () => {
    const start: ModelContext = { job: "move", board: initialBoard(), player: "black", level: 3, opening: true, candidates: [0] };
    expect(promptForContext(start)).toContain("This is the first move of the game");
    const after = applyMove(initialBoard(), getLegalMoves(initialBoard(), "black")[0]!);
    const reply: ModelContext = { job: "move", board: after, player: "white", level: 3, opening: true, candidates: [0] };
    expect(promptForContext(reply)).not.toContain("first move of the game");
    expect(promptForContext(reply)).toContain('Set "reaction" to ""');
  });
});

describe("rematch (D162)", () => {
  const first = {}, second = {}, third = {};
  it("is a game that follows a finished one in the same game screen", () => {
    let track = trackRematch(null, first, false);
    expect(track.rematch).toBe(false);
    track = trackRematch(track, first, true);
    track = trackRematch(track, second, false);
    expect(track.rematch).toBe(true);
    expect(trackRematch(track, second, false).rematch).toBe(true);
  });
  it("a New game in the middle of a game is a start", () => {
    let track = trackRematch(null, first, false);
    track = trackRematch(track, second, false);
    expect(track.rematch).toBe(false);
    track = trackRematch(track, second, true);
    expect(trackRematch(track, third, false).rematch).toBe(true);
  });
});

describe("talk has its own rate budget (D162)", () => {
  const p = FREE_PROVIDERS[0]!;
  const env: Env = { [p.keyEnv]: "test-key", AI_PROVIDER_ORDER: p.id };
  const body = (context: ModelContext) => JSON.stringify({ context });
  const taunt: ModelContext = { job: "taunt", board: initialBoard(), player: "white", level: 2, opening: false, candidates: [], event: "start", humanMoves: 0 };
  const move: ModelContext = { job: "move", board: initialBoard(), player: "black", level: 2, opening: true, candidates: [0, 1] };

  it("a burst of chat lines never makes a move fall back", async () => {
    const send = vi.fn(async (_url: string, init?: RequestInit) => {
      const prompt = JSON.parse(String(init?.body)).messages[0].content as string;
      const content = prompt.startsWith("Reply only as JSON") ? '{"reaction":"I am ready when you are."}' : '{"move":1,"reason":"The moved piece cannot be captured next turn."}';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
    });
    const deps = {
      env: {}, fetch: send as unknown as typeof fetch,
      limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }),
      talkLimiter: createRateLimiter({ limit: 3, windowMs: 60_000 }),
      chain: { env, providers: [p], store: createCooldownStore({}, send as unknown as typeof fetch), fetch: send as unknown as typeof fetch },
    };
    const talk = [];
    for (let i = 0; i < 6; i++) talk.push((await handleAiMove({ method: "POST", clientId: "c", body: body(taunt) }, deps)).body);
    expect(talk.slice(0, 3).every((answer) => "text" in answer)).toBe(true);
    expect(talk.slice(3)).toEqual([{ fallback: true }, { fallback: true }, { fallback: true }]);
    const moves = [];
    for (let i = 0; i < 3; i++) moves.push((await handleAiMove({ method: "POST", clientId: "c", body: body(move) }, deps)).body);
    expect(moves.slice(0, 2).every((answer) => "text" in answer)).toBe(true);
    expect(moves[2]).toEqual({ fallback: true });
  });
});
