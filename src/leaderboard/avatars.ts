// The avatar ids a profile may use (D62): opaque ids "a01" to "a40", one per
// drawing in public/avatars. The server stores only the id, checked against
// this list. Which category an avatar is shown under (the profile screen's
// filter) is known only to the browser, never sent or stored.
export const AVATAR_COUNT = 40;
export const AVATAR_IDS: readonly string[] = Array.from({ length: AVATAR_COUNT }, (_, index) => `a${String(index + 1).padStart(2, "0")}`);

export function isAvatarId(value: unknown): value is string {
  return typeof value === "string" && AVATAR_IDS.includes(value);
}
