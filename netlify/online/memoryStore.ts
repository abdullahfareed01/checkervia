// The room store in memory: the same behaviour as the Supabase adapter, in
// plain maps. For the tests, the development preview and local two window
// play (vite --mode online). Everything is lost when the process stops.
import type { MatchRecord, MemberRecord, OnlineStore, RoomRecord, RoomSnapshot } from "./store";

const DAY_MS = 86_400_000;

interface StoredRoom extends RoomRecord {
  readonly members: MemberRecord[];
  readonly matches: (MatchRecord & { readonly finishedAt: Date | null })[];
}

export interface MemoryOnlineStore extends OnlineStore {
  /** What a test may inspect: never returned by any handler. */
  readonly rooms: readonly StoredRoom[];
}

export function createMemoryOnlineStore(): MemoryOnlineStore {
  const rooms = new Map<string, StoredRoom>(); // key: room id
  const blocks = new Set<string>(); // "blocker blocked"
  let nextId = 1;
  const newId = (kind: string) => `${kind}-${String(nextId++).padStart(6, "0")}`;

  const update = (roomId: string, change: (room: StoredRoom) => Partial<StoredRoom>) => {
    const room = rooms.get(roomId);
    if (room) rooms.set(roomId, { ...room, ...change(room) });
  };
  const updateMember = (roomId: string, playerId: string, change: Partial<MemberRecord>) =>
    update(roomId, (room) => ({ members: room.members.map((member) => (member.playerId === playerId ? { ...member, ...change } : member)) }));
  const updateMatch = (matchId: string, change: (match: StoredRoom["matches"][number]) => Partial<StoredRoom["matches"][number]> | null): boolean => {
    for (const room of rooms.values()) {
      const index = room.matches.findIndex((match) => match.id === matchId);
      if (index < 0) continue;
      const changed = change(room.matches[index]!);
      if (!changed) return false;
      const matches = [...room.matches];
      matches[index] = { ...matches[index]!, ...changed };
      rooms.set(room.id, { ...room, matches });
      return true;
    }
    return false;
  };

  const snapshotOf = (room: StoredRoom): RoomSnapshot => {
    const { members, matches, ...record } = room;
    const latest = [...matches].sort((a, b) => b.number - a.number)[0];
    const match = latest ? (({ finishedAt: _finishedAt, ...rest }) => rest)(latest) : null;
    return { room: record, members: [...members].sort((a, b) => a.seat - b.seat), match };
  };

  return {
    get rooms() {
      return [...rooms.values()];
    },
    async createRoom(input, host) {
      if ([...rooms.values()].some((room) => room.code === input.code)) return "codeTaken";
      const room: StoredRoom = {
        id: newId("room"),
        code: input.code,
        hostId: input.hostId,
        deviceHash: input.deviceHash,
        createdAt: input.at,
        usedAt: input.at,
        closedAt: null,
        rematchBy: null,
        members: [{ ...host, seat: 0, seenAt: input.at, away: false, leftAt: null }],
        matches: [],
      };
      rooms.set(room.id, room);
      return snapshotOf(room).room;
    },
    async snapshot(code) {
      const room = [...rooms.values()].find((stored) => stored.code === code);
      return room ? snapshotOf(room) : null;
    },
    async hostedRooms(playerId) {
      return [...rooms.values()].filter((room) => room.hostId === playerId && room.closedAt === null).map(snapshotOf);
    },
    async openRoomCount(playerId, deviceHash, since) {
      return [...rooms.values()].filter(
        (room) => room.closedAt === null && room.usedAt >= since && (room.hostId === playerId || room.deviceHash === deviceHash),
      ).length;
    },
    async closeRoom(roomId, at) {
      update(roomId, (room) => ({ closedAt: room.closedAt ?? at }));
    },
    async addMember(roomId, member, at) {
      const room = rooms.get(roomId);
      if (!room || room.members.some((stored) => stored.seat === 1)) return "full";
      update(roomId, (stored) => ({ members: [...stored.members, { ...member, seat: 1, seenAt: at, away: false, leftAt: null }], usedAt: at }));
      return "added";
    },
    async touchMember(roomId, playerId, at, away) {
      updateMember(roomId, playerId, { seenAt: at, away });
    },
    async touchRoom(roomId, at) {
      update(roomId, () => ({ usedAt: at }));
    },
    async startMatch(input) {
      const room = rooms.get(input.roomId);
      if (!room || room.matches.some((match) => match.number === input.number)) return "exists";
      const match = { id: newId("match"), ...input, moves: [], finished: false, winnerId: null, reason: null, finishedAt: null };
      update(input.roomId, (stored) => ({ matches: [...stored.matches, match], rematchBy: null }));
      return "started";
    },
    async saveMove(matchId, expectedCount, moves, finish, at) {
      const saved = updateMatch(matchId, (match) =>
        match.finished || match.moves.length !== expectedCount
          ? null
          : { moves: [...moves], ...(finish ? { finished: true, winnerId: finish.winnerId, reason: finish.reason, finishedAt: at } : {}) },
      );
      return saved ? "saved" : "conflict";
    },
    async finishMatch(matchId, finish, at) {
      const done = updateMatch(matchId, (match) => (match.finished ? null : { finished: true, winnerId: finish.winnerId, reason: finish.reason, finishedAt: at }));
      return done ? "finished" : "conflict";
    },
    async requestRematch(roomId, playerId) {
      update(roomId, (room) => ({ rematchBy: room.rematchBy ?? playerId }));
      return rooms.get(roomId)?.rematchBy ?? null;
    },
    async blockedBetween(playerA, playerB) {
      return blocks.has(`${playerA} ${playerB}`) || blocks.has(`${playerB} ${playerA}`);
    },
    async leave(roomId, playerId, at) {
      updateMember(roomId, playerId, { leftAt: at });
      update(roomId, (room) => ({ closedAt: room.closedAt ?? at, usedAt: at }));
    },
    async cleanup(now, keepDays) {
      for (const room of [...rooms.values()]) {
        const used = Math.max(room.usedAt.getTime(), ...room.members.map((member) => member.seenAt.getTime()));
        if (used < now.getTime() - keepDays * DAY_MS) rooms.delete(room.id);
      }
    },
  };
}
