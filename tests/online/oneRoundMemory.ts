// The one round steps of migration 10 (D153) on the in memory stores, with
// the same rules as the SQL (tested on its own in PGlite): every counter
// counted, the player by token, the room as read, and the sign of life only
// when the counters allow it, the player exists and is not hidden, they are
// in the room and it has not expired. `missing` makes either step answer
// null, as when the database does not have migration 10 yet.
import { roomStatus } from "../../netlify/online/rules";
import type { OneRoundStore } from "../../netlify/online/store";
import type { World } from "./world";

export function oneRoundMemory(w: World, missing: { signIn?: boolean; save?: boolean } = {}): OneRoundStore {
  return {
    async signInWithRoom(request) {
      if (missing.signIn) return null;
      const counters = [];
      for (const counter of request.counters) counters.push(await w.store.hitRateLimit(counter.key, request.windowSeconds, counter.limit));
      const player = request.tokenHash === null ? null : await w.store.playerByTokenHash(request.tokenHash);
      const room = await w.online.snapshot(request.code);
      const touched =
        counters.every((counter) => counter.allowed) &&
        player !== null &&
        !player.hidden &&
        room !== null &&
        room.members.some((member) => member.playerId === player.id) &&
        roomStatus(room, request.now) !== "expired";
      if (touched) await w.online.touchMember(room!.room.id, player!.id, request.now, request.away);
      return { counters, player, room, touched };
    },
    async saveMoveAndUse(matchId, roomId, expectedCount, moves, finish, at) {
      if (missing.save) return null;
      const saved = await w.online.saveMove(matchId, expectedCount, moves, finish, at);
      if (saved === "saved") await w.online.touchRoom(roomId, at);
      return saved;
    },
  };
}
