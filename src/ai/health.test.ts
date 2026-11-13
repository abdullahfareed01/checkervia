import { describe, expect, it } from "vitest";
import { checkAiHealth } from "./health";

// A fake fetch that answers once with `answer` (or throws it) and records the call.
function fakeFetch(answer: Response | Error) {
  const calls: { url: string; method: string | undefined }[] = [];
  const send: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { send, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("checkAiHealth", () => {
  it("is ready when the function says so, using a GET to the AI endpoint", async () => {
    const { send, calls } = fakeFetch(json({ ready: true }));
    expect(await checkAiHealth({ fetch: send })).toBe("ready");
    expect(calls).toEqual([{ url: "/.netlify/functions/ai-move", method: "GET" }]);
  });

  it("is offline when the function runs but has no key or model", async () => {
    const { send } = fakeFetch(json({ ready: false }));
    expect(await checkAiHealth({ fetch: send })).toBe("offline");
  });

  it.each([
    ["a network error", new TypeError("Failed to fetch")],
    ["a timeout", new DOMException("t", "TimeoutError")],
    ["a 404", json({}, 404)],
    ["an HTML page (dev server without functions)", new Response("<!doctype html>", { status: 200 })],
    ["JSON without the field", json({ hello: 1 })],
  ])("is unreachable on %s, and never throws", async (_, answer) => {
    const { send } = fakeFetch(answer);
    expect(await checkAiHealth({ fetch: send })).toBe("unreachable");
  });
});
