import { describe, expect, it } from "vitest";
import { CLIENT_TIMEOUT_MS, ENDPOINT, createCallModel } from "./client";

// A fake fetch that returns what it is given and records the request.
function fakeFetch(reply: Response | Error | (() => Promise<Response>)) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply() : reply;
  };
  return { fetchImpl, calls };
}

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("callModel client", () => {
  it("POSTs the prompt to the Netlify function and returns the text", async () => {
    const { fetchImpl, calls } = fakeFetch(ok({ text: '{"move": 3}' }));
    const text = await createCallModel({ fetch: fetchImpl })("PROMPT");

    expect(text).toBe('{"move": 3}');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/.netlify/functions/ai-move");
    expect(ENDPOINT).toBe("/.netlify/functions/ai-move");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ prompt: "PROMPT" });
  });

  it("sends the retry note as its own field", async () => {
    const { fetchImpl, calls } = fakeFetch(ok({ text: "x" }));
    await createCallModel({ fetch: fetchImpl })("PROMPT", "Move 9 is not in the list.");

    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      prompt: "PROMPT",
      retryNote: "Move 9 is not in the list.",
    });
  });

  it("sets a timeout longer than the 60 second Netlify function limit", async () => {
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(60_000);
    const { fetchImpl, calls } = fakeFetch(ok({ text: "x" }));
    await createCallModel({ fetch: fetchImpl })("p");
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([400, 405, 429, 500, 502, 504])("throws on status %i", async (status) => {
    const { fetchImpl } = fakeFetch(ok({ error: "nope" }, status));
    await expect(createCallModel({ fetch: fetchImpl })("p")).rejects.toThrow(String(status));
  });

  it("throws on any status other than 200, even a success status like 204", async () => {
    const { fetchImpl } = fakeFetch(new Response(null, { status: 204 }));
    await expect(createCallModel({ fetch: fetchImpl })("p")).rejects.toThrow("204");
  });

  it("throws if the network fails", async () => {
    const { fetchImpl } = fakeFetch(new TypeError("Failed to fetch"));
    await expect(createCallModel({ fetch: fetchImpl })("p")).rejects.toThrow("Could not reach");
  });

  it("throws if the answer is not JSON", async () => {
    const { fetchImpl } = fakeFetch(new Response("<html>", { status: 200 }));
    await expect(createCallModel({ fetch: fetchImpl })("p")).rejects.toThrow("unreadable");
  });

  it.each([
    ["no text field", { other: 1 }],
    ["text that is not a string", { text: 5 }],
    ["empty text", { text: "" }],
    ["blank text", { text: "  " }],
  ])("throws on %s", async (_name, body) => {
    const { fetchImpl } = fakeFetch(ok(body));
    await expect(createCallModel({ fetch: fetchImpl })("p")).rejects.toThrow("empty");
  });

  it("gives up when the request hangs (real timeout)", async () => {
    const { fetchImpl } = fakeFetch(
      () => new Promise<Response>(() => {}), // never answers
    );
    const hanging: typeof fetch = (input, init) =>
      new Promise((_resolve, reject) => {
        void fetchImpl(input, init);
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });

    await expect(createCallModel({ fetch: hanging, timeoutMs: 30 })("p")).rejects.toThrow("timed out");
  });
});
