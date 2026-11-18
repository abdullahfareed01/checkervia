import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_DEADLINE_MS, CHAT_TYPING_MS, deliverChat, TURN_CUE_MS } from "../src/ui/chatDelivery";
import type { ChatFrame } from "../src/ui/chatDelivery";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("one chat delivery per event", () => {
  it("holds a varied turn cue, then dots, then exactly one fast reply", async () => {
    const frames: ChatFrame[] = [];
    deliverChat("On you now.", "Local remark.", async () => "Bring a real plan.", frame => frames.push(frame));
    await vi.advanceTimersByTimeAsync(TURN_CUE_MS - 1);
    expect(frames).toEqual([{ phase: "cue", text: "On you now." }]);
    await vi.advanceTimersByTimeAsync(1);
    expect(frames.at(-1)).toEqual({ phase: "typing", text: null });
    await vi.advanceTimersByTimeAsync(CHAT_TYPING_MS - 1);
    expect(frames).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(frames.at(-1)).toEqual({ phase: "final", text: "Bring a real plan." });
    await vi.advanceTimersByTimeAsync(20000);
    expect(frames).toHaveLength(3);
  });
  it.each(["reject", "empty", "offline"])("always finishes with local speech when %s", async mode => {
    const frames: ChatFrame[] = [];
    const request = mode === "offline" ? null : async () => { if (mode === "reject") throw new Error("unavailable"); return null; };
    deliverChat(null, "Make me work for it.", request, frame => frames.push(frame));
    await vi.advanceTimersByTimeAsync(CHAT_TYPING_MS);
    expect(frames).toEqual([{ phase: "typing", text: null }, { phase: "final", text: "Make me work for it." }]);
  });
  it("times out without waiting forever and ignores a later reply", async () => {
    const frames: ChatFrame[] = [];
    let finish!: (text: string) => void;
    let signal!: AbortSignal;
    deliverChat("Your move.", "Fallback stays.", async next => { signal = next; return new Promise(resolve => { finish = resolve; }); }, frame => frames.push(frame));
    await vi.advanceTimersByTimeAsync(CHAT_DEADLINE_MS);
    expect(frames.at(-1)).toEqual({ phase: "final", text: "Fallback stays." });
    expect(signal.aborted).toBe(true);
    finish("Too late.");
    await Promise.resolve(); await Promise.resolve();
    expect(frames.filter(frame => frame.phase === "final")).toHaveLength(1);
    expect(frames.at(-1)?.text).toBe("Fallback stays.");
  });
  it("cancels on a new turn, game, review or unmount and never reveals stale text", async () => {
    const frames: ChatFrame[] = [];
    let finish!: (text: string) => void;
    const stop = deliverChat("Your turn.", "Local.", () => new Promise(resolve => { finish = resolve; }), frame => frames.push(frame));
    await Promise.resolve();
    stop(); finish("Old game.");
    await vi.advanceTimersByTimeAsync(20000);
    expect(frames).toEqual([{ phase: "cue", text: "Your turn." }]);
  });
  it("StrictMode cleanup prevents the discarded effect from sending a request", async () => {
    const request = vi.fn(async () => "One line.");
    const stop = deliverChat(null, "Fallback.", request, () => {});
    stop();
    deliverChat(null, "Fallback.", request, () => {});
    await vi.advanceTimersByTimeAsync(CHAT_TYPING_MS);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
