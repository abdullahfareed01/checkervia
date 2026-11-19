// The room this browser is in, kept on the device so a reload or a new tab
// goes straight back into the room and its game (D142). Only the code is
// kept; the server says the rest. Forgotten when the player leaves, or
// when the room has closed or expired.
const ROOM_KEY = "checkervia.online.room";

export function rememberedRoom(): string | null {
  try {
    const value = JSON.parse(localStorage.getItem(ROOM_KEY) ?? "null") as unknown;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export function rememberRoom(code: string | null): void {
  try {
    if (code === null) localStorage.removeItem(ROOM_KEY);
    else localStorage.setItem(ROOM_KEY, JSON.stringify(code));
  } catch {
    // Private browsing or full storage: the room is just not remembered.
  }
}
