// Public traffic events contain no moves, names, tokens, raw IPs or emails.
export const PRESENCE_PATH = "/.netlify/functions/game-presence";
export const PRESENCE_HEADER = "x-checkervia-presence";
export const HEARTBEAT_MS = 30_000;
export const PRESENCE_TTL_SECONDS = 75;
export type GamePresence = { readonly mode: "ai" | "two"; readonly level: number | null; readonly country: string | null };
export type TrafficEvent = { readonly action: "visit" } | { readonly action: "end" } | ({ readonly action: "beat" } & GamePresence);
