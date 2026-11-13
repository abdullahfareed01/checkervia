import { describe, expect, it } from "vitest";
import { getLegalMoves, initialBoard } from "../engine";
import { boardFrom } from "../engine/testUtils";
import { chooseMove } from "./chooseMove";
import type { CallModel } from "./chooseMove";
import { buildPrompt } from "./prompt";

const board = initialBoard();
const legal = getLegalMoves(board, "black"); // 7 moves

// A fake model that plays back a script. A string is a reply; an Error is
// thrown. It records every call, and throws if called more often than the
// script allows.
function fakeModel(script: (string | Error)[]) {
  const calls: { prompt: string; note: string | undefined }[] = [];
  const callModel: CallModel = async (prompt, note) => {
    calls.push({ prompt, note });
    const step = script[calls.length - 1];
    if (step === undefined) throw new Error("unexpected extra call");
    if (step instanceof Error) throw step;
    return step;
  };
  return { callModel, calls };
}

describe("chooseMove: success", () => {
  it("returns the move the model picked, taken from the legal list", async () => {
    const { callModel, calls } = fakeModel(['{"move": 3}']);
    const result = await chooseMove(board, "black", callModel);

    expect(result).toEqual({ ok: true, move: legal[2], attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  it("sends the built prompt and no retry note on the first call", async () => {
    const { callModel, calls } = fakeModel(['{"move": 1}']);
    await chooseMove(board, "black", callModel);

    expect(calls[0]!.prompt).toBe(buildPrompt(board, "black", legal));
    expect(calls[0]!.note).toBeUndefined();
  });

  it("works for white too", async () => {
    const { callModel } = fakeModel(['{"move": 2}']);
    const result = await chooseMove(board, "white", callModel);
    expect(result.ok && result.move).toEqual(getLegalMoves(board, "white")[1]);
  });

  it("accepts JSON with extra text around it", async () => {
    const { callModel, calls } = fakeModel(['Sure! Here it is: {"move": 4} Good luck.']);
    const result = await chooseMove(board, "black", callModel);

    expect(result.ok && result.move).toEqual(legal[3]);
    expect(calls).toHaveLength(1);
  });

  it("accepts JSON inside a code fence", async () => {
    const { callModel } = fakeModel(['```json\n{"move": 7}\n```']);
    const result = await chooseMove(board, "black", callModel);
    expect(result.ok && result.move).toEqual(legal[6]);
  });
});

describe("chooseMove: retries after a rejected reply", () => {
  it("retries once after an invalid reply, then succeeds", async () => {
    const { callModel, calls } = fakeModel(["I think the third one", '{"move": 5}']);
    const result = await chooseMove(board, "black", callModel);

    expect(result).toEqual({ ok: true, move: legal[4], attempts: 2 });
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["an out of range number", '{"move": 8}'],
    ["a decimal", '{"move": 2.5}'],
    ["zero", '{"move": 0}'],
    ["a negative number", '{"move": -1}'],
    ["garbage text", "banana"],
    ["a number in quotes", '{"move": "2"}'],
  ])("rejects %s and asks again", async (_name, badReply) => {
    const { callModel, calls } = fakeModel([badReply, '{"move": 2}']);
    const result = await chooseMove(board, "black", callModel);

    expect(result.ok && result.move).toEqual(legal[1]);
    expect(calls).toHaveLength(2);
  });

  it("gives the retry call a note that contains the reason", async () => {
    const { callModel, calls } = fakeModel(['{"move": 99}', '{"move": 1}']);
    await chooseMove(board, "black", callModel);

    expect(calls[0]!.note).toBeUndefined();
    const note = calls[1]!.note!;
    expect(note).toContain("Move 99 is not in the list");
    expect(note).toContain("1 to 7");
    expect(note).toContain('{"move": <number>, "reason": "<why>", "reaction": "<line>"}');
  });

  it("sends the same prompt on every retry, with only the note changing", async () => {
    const { callModel, calls } = fakeModel(["bad", "worse", '{"move": 1}']);
    await chooseMove(board, "black", callModel);

    expect(calls).toHaveLength(3);
    expect(calls[1]!.prompt).toBe(calls[0]!.prompt);
    expect(calls[2]!.prompt).toBe(calls[0]!.prompt);
    expect(calls[2]!.note).toContain('No JSON object with a "move" field');
  });

  it("can succeed on the very last allowed attempt (call 4)", async () => {
    const { callModel, calls } = fakeModel(["a", "b", "c", '{"move": 6}']);
    const result = await chooseMove(board, "black", callModel);

    expect(result).toEqual({ ok: true, move: legal[5], attempts: 4 });
    expect(calls).toHaveLength(4);
  });
});

describe("chooseMove: failure", () => {
  it("fails after 4 bad replies, using exactly 4 calls (1 + 3 retries)", async () => {
    const { callModel, calls } = fakeModel(["bad 1", '{"move": 0}', '{"move": 1.5}', "bad 4"]);
    const result = await chooseMove(board, "black", callModel);

    expect(calls).toHaveLength(4);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(4);
      expect(result.reasons).toHaveLength(4);
      expect(result.reasons[1]).toContain("Move 0 is not in the list");
      expect(result.reasons[2]).toContain("whole number");
    }
  });

  it("never returns a move on failure, so nothing can be played by guessing", async () => {
    const { callModel } = fakeModel(["x", "x", "x", "x"]);
    const result = await chooseMove(board, "black", callModel);

    expect(result.ok).toBe(false);
    expect("move" in result).toBe(false);
  });

  it("respects a smaller retry limit", async () => {
    const none = fakeModel(["bad"]);
    expect((await chooseMove(board, "black", none.callModel, 0)).ok).toBe(false);
    expect(none.calls).toHaveLength(1);

    const one = fakeModel(["bad", "bad"]);
    await chooseMove(board, "black", one.callModel, 1);
    expect(one.calls).toHaveLength(2);
  });

  it("does not call the model when there are no legal moves", async () => {
    // Black (8,1) is boxed in: (7,2) is taken and the jump needs (6,3), also taken.
    const blocked = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "........",
      "..w.....",
      ".w......",
      "b.......",
    ]);
    const { callModel, calls } = fakeModel([]);
    const result = await chooseMove(blocked, "black", callModel);

    expect(calls).toHaveLength(0);
    expect(result).toEqual({
      ok: false,
      reasons: ["There are no legal moves to choose from."],
      attempts: 0,
    });
  });
});

describe("chooseMove: a model that throws", () => {
  it("counts a thrown error as a failed attempt and tries again", async () => {
    const { callModel, calls } = fakeModel([new Error("network down"), '{"move": 2}']);
    const result = await chooseMove(board, "black", callModel);

    expect(result).toEqual({ ok: true, move: legal[1], attempts: 2 });
    expect(calls).toHaveLength(2);
    // The model never answered, so there is nothing to explain in a retry note.
    expect(calls[1]!.note).toBeUndefined();
  });

  it("fails with the error in the reasons if the model always throws", async () => {
    const boom = new Error("timeout after 20s");
    const { callModel, calls } = fakeModel([boom, boom, boom, boom]);
    const result = await chooseMove(board, "black", callModel);

    expect(calls).toHaveLength(4);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toHaveLength(4);
      result.reasons.forEach((reason) => expect(reason).toContain("timeout after 20s"));
    }
  });

  it("handles a model that throws something that is not an Error", async () => {
    const callModel: CallModel = async () => {
      throw "plain string"; // eslint-disable-line @typescript-eslint/only-throw-error
    };
    const result = await chooseMove(board, "black", callModel, 0);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain("plain string");
  });

  it("explains a rejected reply on the call after an error, not before", async () => {
    const { callModel, calls } = fakeModel([new Error("oops"), "garbage", '{"move": 1}']);
    await chooseMove(board, "black", callModel);

    expect(calls[1]!.note).toBeUndefined(); // after the error
    expect(calls[2]!.note).toContain('No JSON object with a "move" field'); // after garbage
  });
});

describe("chooseMove: the move always comes from the legal list", () => {
  it("returns a legal move for every valid number", async () => {
    for (let number = 1; number <= legal.length; number++) {
      const { callModel } = fakeModel([`{"move": ${number}}`]);
      const result = await chooseMove(board, "black", callModel);
      expect(result.ok && result.move).toEqual(legal[number - 1]);
    }
  });

  it("with a forced capture, only capture moves can be chosen", async () => {
    const capture = boardFrom([
      ".w......",
      "........",
      "........",
      "........",
      "...w....",
      "..b.....",
      "........",
      "b.......",
    ]);
    // Only one legal move exists (the capture); move 2 does not exist.
    const { callModel } = fakeModel(['{"move": 2}', '{"move": 1}']);
    const result = await chooseMove(capture, "black", callModel);

    expect(result.ok && result.move.captured).toHaveLength(1);
    expect(result.ok && result.attempts).toBe(2);
  });
});

describe("chooseMove: the model's reason", () => {
  it("passes on the reason with the chosen move", async () => {
    const { callModel } = fakeModel(['{"move": 2, "reason": "Keeps my back row safe."}']);
    const result = await chooseMove(board, "black", callModel);

    expect(result).toEqual({ ok: true, move: legal[1], attempts: 1, reason: "Keeps my back row safe." });
  });

  it("still plays the move when the reason is missing", async () => {
    const { callModel } = fakeModel(['{"move": 2}']);
    const result = await chooseMove(board, "black", callModel);

    expect(result).toEqual({ ok: true, move: legal[1], attempts: 1 });
    expect(result.ok && "reason" in result).toBe(false);
  });

  it("uses the reason from the attempt that succeeded", async () => {
    const { callModel } = fakeModel(['{"move": 99, "reason": "old"}', '{"move": 1, "reason": "new"}']);
    const result = await chooseMove(board, "black", callModel);

    expect(result).toMatchObject({ ok: true, attempts: 2, reason: "new" });
  });
});
