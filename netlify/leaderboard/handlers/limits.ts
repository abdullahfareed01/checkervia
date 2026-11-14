// Rate limits for each function, per fixed window. Writes are tight, reads
// generous. One place to tune them. A refused request still counts, so a
// client that keeps trying waits until the window ends.
import type { Limit } from "../http";

export const LIMITS = {
  // The live availability check runs while the player types (the browser
  // waits for a pause in typing first).
  checkUsername: { windowSeconds: 60, perDevice: 40, perIp: 120 },
  claimUsername: { windowSeconds: 3600, perDevice: 5, perIp: 20 },
  // A real game takes minutes, so 10 wins an hour is far above honest play.
  submitWin: { windowSeconds: 3600, perDevice: 10, perIp: 30 },
  reportGame: { windowSeconds: 3600, perDevice: 30, perIp: 90 },
  updateProfile: { windowSeconds: 3600, perDevice: 20, perIp: 60 },
  // Renaming is also limited to once in 7 days per player (D61); this stops
  // a device from trying many names in a row.
  renameUsername: { windowSeconds: 3600, perDevice: 5, perIp: 20 },
  getLeaderboard: { windowSeconds: 60, perIp: 60 },
  getProfile: { windowSeconds: 60, perIp: 60 },
} satisfies Record<string, Limit>;

// Body limits in characters. A win of 600 moves fits in about 12,000.
export const MAX_BODY = {
  claimUsername: 256,
  submitWin: 32_000,
  reportGame: 256,
  updateProfile: 160,
};
