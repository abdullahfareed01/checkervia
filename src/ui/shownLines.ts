// The AI's last few final chat lines in this tab (D159), so the taunt model
// is told what it said and a line is never repeated soon. Kept in
// sessionStorage like the session record: only the AI's own words, gone
// when the tab closes.
import { NO_REPEAT } from "../ai/lines";

export const SHOWN_KEY = "draft.shownLines";
export const SHOWN_KEPT = 3;

type Store = Pick<Storage, "getItem" | "setItem">;

function tabStore(): Store | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** The last lines shown, oldest first; empty if there are none or they cannot be read. */
export function readShownLines(store: Store | null = tabStore()): string[] {
  try {
    const value: unknown = JSON.parse(store?.getItem(SHOWN_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((line): line is string => typeof line === "string" && line.length > 0 && line.length <= 140).slice(-SHOWN_KEPT) : [];
  } catch {
    return [];
  }
}

/** Adds a final line, keeping only the last few. */
export function rememberShownLine(line: string, store: Store | null = tabStore()): void {
  try {
    store?.setItem(SHOWN_KEY, JSON.stringify([...readShownLines(store), line].slice(-SHOWN_KEPT)));
  } catch {
    // Not remembered; the next line may simply repeat an older one.
  }
}

// The cues and local lines picked lately, per list (D161), so a line never
// comes back within 3 picks of its list. The cue and the line after it are
// separate lists with separate random picks, so they never move in pairs.
export const PICKS_KEY = "draft.chatPicks";

function readPicks(store: Store | null): Record<string, string[]> {
  try {
    const value: unknown = JSON.parse(store?.getItem(PICKS_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const picks: Record<string, string[]> = {};
    for (const [list, lines] of Object.entries(value)) if (Array.isArray(lines)) picks[list] = lines.filter((line): line is string => typeof line === "string").slice(-NO_REPEAT);
    return picks;
  } catch {
    return {};
  }
}

/** One of `lines` at random, none of the last 3 picked from `list`, remembered. */
export function pickFresh(list: string, lines: readonly string[], random: () => number = Math.random, store: Store | null = tabStore()): string {
  const picks = readPicks(store);
  const recent = picks[list] ?? [];
  const allowed = lines.filter((line) => !recent.includes(line));
  const choices = allowed.length > 0 ? allowed : lines;
  const line = choices[Math.floor(random() * choices.length) % choices.length]!;
  try {
    store?.setItem(PICKS_KEY, JSON.stringify({ ...picks, [list]: [...recent, line].slice(-NO_REPEAT) }));
  } catch {
    // Not remembered; the next pick is still random.
  }
  return line;
}
