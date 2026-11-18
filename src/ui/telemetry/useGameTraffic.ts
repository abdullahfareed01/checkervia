import { useEffect } from "react";
import type { GameState } from "../../state/gameReducer";
import type { GamePresence } from "../../telemetry/protocol";
import { HEARTBEAT_MS, PRESENCE_HEADER, PRESENCE_PATH } from "../../telemetry/protocol";
import { DEVICE_HEADER } from "../../leaderboard/protocol";
import { deviceId, useLeaderboardProfile } from "../leaderboard/profile";
import { createTrafficClient } from "./client";
let shared: ReturnType<typeof createTrafficClient> | undefined;
function trafficClient() {
  if (!shared) {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Private browsing. */ }
    shared = createTrafficClient({ storage, now: Date.now, async send(event) {
      const response = await fetch(PRESENCE_PATH, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json", [PRESENCE_HEADER]: "1", [DEVICE_HEADER]: deviceId() },
        body: JSON.stringify(event), keepalive: event.action === "end", signal: AbortSignal.timeout(4000) });
      return { status: response.status, retryAfter: response.headers.get("retry-after") };
    } });
  }
  return shared;
}
export function gamePresence(state: Pick<GameState, "mode" | "aiLevel" | "winner" | "abandoned"> & { drawn?: unknown }, country: string | null): GamePresence | null {
  if (state.winner || state.abandoned || state.drawn) return null;
  return { mode: state.mode === "vs-ai" ? "ai" : "two", level: state.mode === "vs-ai" ? state.aiLevel : null, country };
}
export function useGameVisits() {
  useEffect(() => {
    const visit = () => { if (document.visibilityState === "visible") void trafficClient().visit(); };
    visit(); document.addEventListener("visibilitychange", visit);
    return () => document.removeEventListener("visibilitychange", visit);
  }, []);
}
export function useGamePresence(state: GameState) {
  const { profile } = useLeaderboardProfile();
  const presence = gamePresence(state, profile?.country ?? null);
  const signature = JSON.stringify(presence);
  useEffect(() => {
    const client = trafficClient();
    const value = JSON.parse(signature) as GamePresence | null;
    const beat = () => {
      if (value && document.visibilityState === "visible") { void client.visit(); void client.presence(value); }
      else void client.presence(null);
    };
    beat();
    const timer = value ? setInterval(() => { if (document.visibilityState === "visible") beat(); }, HEARTBEAT_MS) : null;
    document.addEventListener("visibilitychange", beat);
    const end = () => { void client.presence(null); };
    window.addEventListener("pagehide", end);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", beat); window.removeEventListener("pagehide", end);
      void client.presence(null);
    };
  }, [signature]);
}
