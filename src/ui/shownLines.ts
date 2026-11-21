// The AI's last few final chat lines in this tab (D159), so the taunt model
// is told what it said and a line is never repeated soon. Kept in
// sessionStorage like the session record: only the AI's own words, gone
// when the tab closes.
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
