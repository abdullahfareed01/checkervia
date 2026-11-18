import type { GamePresence, TrafficEvent } from "../../telemetry/protocol";
export const VISIT_DAY_KEY = "checkervia.visitDay";
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface Reply { readonly status: number; readonly retryAfter?: string | null }
export interface TrafficClientOptions { send: (event: TrafficEvent) => Promise<Reply>; now: () => number; storage: Storage | null }
/** Coalesce rapid screen changes. One in-flight heartbeat preserves ordering. */
export function createTrafficClient({ send, now, storage }: TrafficClientOptions) {
  let blockedUntil = 0;
  let visiting: Promise<void> | null = null;
  let acknowledgedDay = "";
  let pending: TrafficEvent | null = null;
  let flight: Promise<void> | null = null;
  const ready = () => now() >= blockedUntil;
  async function transmit(event: TrafficEvent): Promise<boolean> {
    if (!ready()) return false;
    try {
      const result = await send(event);
      if (result.status >= 200 && result.status < 300) return true;
      const retry = Number(result.retryAfter);
      blockedUntil = now() + (Number.isFinite(retry) && retry > 0 ? Math.min(3600, retry) : result.status === 503 ? 300 : 60) * 1000;
    } catch { blockedUntil = now() + 60_000; }
    return false;
  }
  async function visit(): Promise<void> {
    const day = new Date(now()).toISOString().slice(0, 10);
    let saved: string | null = null;
    try { saved = storage?.getItem(VISIT_DAY_KEY) ?? null; } catch { /* Storage is optional. */ }
    if (acknowledgedDay === day || saved === day || !ready()) return;
    if (visiting) return visiting;
    visiting = (async () => {
      if (await transmit({ action: "visit" })) {
        acknowledgedDay = day;
        try { storage?.setItem(VISIT_DAY_KEY, day); } catch { /* Memory avoids repeat calls. */ }
      }
    })().finally(() => { visiting = null; });
    return visiting;
  }
  function presence(value: GamePresence | null): Promise<void> {
    pending = value ? { action: "beat", ...value } : { action: "end" };
    flight ??= (async () => {
      // Defer one microtask so StrictMode and quick mode switches coalesce.
      await Promise.resolve();
      try {
        while (pending) {
          const event = pending; pending = null;
          await transmit(event);
        }
      } finally { flight = null; }
    })();
    return flight;
  }
  return { visit, presence };
}
