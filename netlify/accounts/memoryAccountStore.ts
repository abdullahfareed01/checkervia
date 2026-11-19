// Saved progress in memory: the same behaviour as migration 9, for tests and
// the development server. Shares the players and device keys of a memory
// leaderboard store. Everything is lost when the process stops.
import type { MemoryStore } from "../leaderboard/memoryStore";
import type { AccountLink, AccountStore, CodeRequest, SavedData } from "./store";

export interface MemoryAccountStore extends AccountStore {
  /** As deleting the player row: link, keys and saves go, the Auth user is queued. */
  deletePlayer(playerId: string): void;
  readonly links: readonly AccountLink[];
}

export function createMemoryAccountStore(players: MemoryStore, now: () => number = Date.now): MemoryAccountStore {
  let links: AccountLink[] = [];
  const saves = new Map<string, SavedData>();
  const codes = new Map<string, CodeRequest>();
  const erasures = new Map<string, number>(); // Auth user id to when it was queued

  // The trigger of migration 9: a link that goes queues its Auth user.
  function dropLink(playerId: string): boolean {
    const link = links.find((stored) => stored.playerId === playerId);
    if (!link) return false;
    links = links.filter((stored) => stored !== link);
    if (!erasures.has(link.authUserId)) erasures.set(link.authUserId, now());
    return true;
  }

  return {
    get links() {
      return links;
    },
    deletePlayer(playerId) {
      dropLink(playerId);
      saves.delete(playerId);
      players.deletePlayer(playerId);
    },
    async linkOfPlayer(playerId) {
      return links.find((link) => link.playerId === playerId) ?? null;
    },
    async linkOfUser(authUserId) {
      return links.find((link) => link.authUserId === authUserId) ?? null;
    },
    async linkOfEmail(emailHash) {
      return links.find((link) => link.emailHash === emailHash) ?? null;
    },
    async link(link) {
      if (links.some((stored) => stored.playerId === link.playerId)) return "profileLinked";
      if (links.some((stored) => stored.authUserId === link.authUserId || stored.emailHash === link.emailHash)) return "emailTaken";
      links = [...links, link];
      erasures.delete(link.authUserId);
      return "linked";
    },
    async unlink(playerId) {
      saves.delete(playerId);
      return dropLink(playerId);
    },
    async playerById(playerId) {
      return players.playerById(playerId);
    },
    async addDeviceToken(playerId, tokenHash) {
      players.addDeviceToken(playerId, tokenHash);
    },
    async removeDeviceToken(tokenHash) {
      return players.removeDeviceToken(tokenHash);
    },
    async replaceFirstToken(playerId, tokenHash) {
      players.replaceFirstToken(playerId, tokenHash);
    },
    async saved(playerId) {
      return saves.get(playerId) ?? null;
    },
    async putSaved(playerId, collection, settings) {
      const updatedAt = new Date(now());
      saves.set(playerId, { collection, settings, updatedAt });
      return updatedAt;
    },
    async code(emailHash) {
      return codes.get(emailHash) ?? null;
    },
    async putCode(request) {
      codes.set(request.emailHash, request);
    },
    async wrongCode(emailHash) {
      const current = codes.get(emailHash);
      if (!current) return 0;
      codes.set(emailHash, { ...current, wrongAttempts: current.wrongAttempts + 1 });
      return current.wrongAttempts + 1;
    },
    async useCode(emailHash) {
      const current = codes.get(emailHash);
      if (current) codes.set(emailHash, { ...current, used: true });
    },
    async queueStaleCodes(before) {
      let queued = 0;
      for (const [hash, request] of codes) {
        if (request.requestedAt >= before) continue;
        codes.delete(hash);
        const linked = links.some((link) => link.authUserId === request.authUserId);
        if (request.createdUser && request.authUserId !== null && !linked && !erasures.has(request.authUserId)) {
          erasures.set(request.authUserId, now());
          queued += 1;
        }
      }
      return queued;
    },
    async erasures(limit) {
      return [...erasures.entries()].sort((a, b) => a[1] - b[1]).slice(0, limit).map(([id]) => id);
    },
    async erased(authUserId) {
      erasures.delete(authUserId);
    },
  };
}
