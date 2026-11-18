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

  it("allows the provider deadline to arrive inside the total turn budget", async () => {
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(10_000);
    expect(CLIENT_TIMEOUT_MS).toBeLessThan(12_000);
    const { fetchImpl, calls } = fakeFetch(ok({ text: "x" }));
    await createCallModel({ fetch: fetchImpl })("p");
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([502, 504])("throws on transient status %i from an older function", async (status) => {
    const { fetchImpl } = fakeFetch(ok({ error: "nope" }, status));
    await expect(createCallModel({ fetch: fetchImpl })("p")).rejects.toThrow(String(status));
  });

  it.each([[400, "access"], [401, "access"], [402, "credits"], [403, "access"], [405, "access"], [429, "rateLimit"], [500, "configuration"]])("stops retries on permanent status %i from an older function", async (status, code) => {
    const { fetchImpl } = fakeFetch(ok({ error: "nope" }, Number(status)));
    await expect(createCallModel({ fetch: fetchImpl })("p")).rejects.toMatchObject({ code, retryable: false });
  });

  it("throws on any status other than 200, even a success status like 204", async () => {
    const { fetchImpl } = fakeFetch(new Response(null, { status: 204 }));
    await expect(createCallModel({ fetch: fetchImpl })("p")).rejects.toThrow("204");
  });

  it("throws if the network fails", async () => {
    const { fetchImpl } = fakeFetch(new TypeError("Failed to fetch"));
    await expect(createCallModel({ fetch: fetchImpl })("p")).rejects.toThrow("Could not reach");
  });

  it("uses only the safe service category and never provider error text", async () => {
    const { fetchImpl } = fakeFetch(ok({ code: "credits", retryable: false, error: "PRIVATE PROVIDER DETAIL" }, 502));
    const call = createCallModel({ fetch: fetchImpl });
    await expect(call("p")).rejects.toMatchObject({ code: "credits", retryable: false });
    const { fetchImpl: again } = fakeFetch(ok({ code: "credits", retryable: false, error: "PRIVATE PROVIDER DETAIL" }, 502));
    await expect(createCallModel({ fetch: again })("p")).rejects.not.toThrow("PRIVATE PROVIDER DETAIL");
  });

  it("keeps a valid provider delay and rejects malformed delay values", async () => {
    for (const [seconds, ms] of [[30, 30_000], ["30", 0], [-1, 0]] as const) {
      const { fetchImpl } = fakeFetch(ok({ code: "busy", retryable: true, retryAfterSeconds: seconds }, 502));
      await expect(createCallModel({ fetch: fetchImpl })("p")).rejects.toMatchObject({ code: "busy", retryable: true, retryAfterMs: ms });
    }
  });

  it("forwards cancellation to fetch so an abandoned request does not keep running", async () => {
    const controller = new AbortController();
    let received: AbortSignal | null | undefined;
    const send: typeof fetch = async (_input, init) => {
      received = init?.signal;
      return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }));
    };
    const request = createCallModel({ fetch: send })("p", undefined, controller.signal);
    controller.abort(new Error("Game changed"));
    await expect(request).rejects.toThrow("Game changed");
    expect(received?.aborted).toBe(true);
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
