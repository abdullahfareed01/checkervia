// The room store's Supabase adapter against a fake HTTP layer: the requests
// it makes (one request for a room with its players and latest game, the
// conditions that make a move or an end safe when two requests race) and
// how it reads answers and errors. The SQL itself is tested in PGlite.
import { describe, expect, it } from "vitest";
import { createSupabaseOnlineStore } from "../../netlify/online/supabaseStore";

interface Seen {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

function fakeDb(answer: (request: Seen) => { status: number; body: unknown; headers?: Record<string, string> }) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: Seen = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    seen.push(request);
    const { status, body, headers } = answer(request);
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  }) as typeof fetch;
  return { seen, store: createSupabaseOnlineStore("https://example.supabase.co", "sb_secret_N7xFakeKeyForTests0000000000", fetchImpl) };
}

const ROW = {
  id: "r1",
  code: "ABCDEF",
  host_id: "p1",
  device_hash: "dev",
  created_at: "2026-11-18T12:00:00Z",
  used_at: "2026-11-18T12:01:00Z",
  closed_at: null,
  rematch_by: null,
  online_members: [
    { player_id: "p2", seat: 1, username: "Guesty", avatar: "a12", country: "GB", seen_at: "2026-11-18T12:02:00Z", away: true, left_at: null },
    { player_id: "p1", seat: 0, username: "Hosty", avatar: null, country: null, seen_at: "2026-11-18T12:02:30Z", away: false, left_at: null },
  ],
  online_matches: [{ id: "m1", number: 2, black_id: "p2", white_id: "p1", moves: [[40, 33]], starts_at: "2026-11-18T12:01:05Z", finished: false, winner_id: null, reason: null }],
};

describe("the room store on Supabase", () => {
  it("reads a room with its players and only its latest game in one request, with the secret key in apikey", async () => {
    const { seen, store } = fakeDb(() => ({ status: 200, body: ROW }));
    const snapshot = await store.snapshot("ABCDEF");
    expect(seen).toHaveLength(1);
    const { url, headers } = seen[0]!;
    expect(url.pathname).toBe("/rest/v1/online_rooms");
    expect(url.searchParams.get("code")).toBe("eq.ABCDEF");
    expect(url.searchParams.get("select")).toContain("online_members(");
    expect(url.searchParams.get("online_matches.order")).toBe("number.desc");
    expect(url.searchParams.get("online_matches.limit")).toBe("1");
    expect(headers.get("apikey")).toBe("sb_secret_N7xFakeKeyForTests0000000000");
    expect(headers.get("authorization")).toBeNull();
    expect(snapshot!.members.map((member) => member.seat)).toEqual([0, 1]);
    expect(snapshot!.members[1]).toMatchObject({ playerId: "p2", away: true, seenAt: new Date("2026-11-18T12:02:00Z"), leftAt: null });
    expect(snapshot!.match).toMatchObject({ id: "m1", number: 2, blackId: "p2", moves: [[40, 33]], finished: false, startsAt: new Date("2026-11-18T12:01:05Z") });
  });

  it("answers null for an unknown code", async () => {
    const { store } = fakeDb(() => ({ status: 406, body: { code: "PGRST116" } }));
    // maybeSingle turns "no row" into null.
    const { store: empty } = fakeDb(() => ({ status: 200, body: [] }));
    expect(await empty.snapshot("ZZZZZZ")).toBeNull();
    await expect(store.snapshot("ZZZZZZ")).rejects.toMatchObject({ code: "PGRST116" });
  });

  it("stores a move only on top of the expected move count of a game that is not over", async () => {
    const { seen, store } = fakeDb(() => ({ status: 200, body: [{ id: "m1" }] }));
    expect(await store.saveMove("m1", 4, [[40, 33], [17, 24], [44, 35], [21, 28], [35, 21]], null, new Date("2026-11-18T12:05:00Z"))).toBe("saved");
    const { url, method, body } = seen[0]!;
    expect(method).toBe("PATCH");
    expect(url.searchParams.get("id")).toBe("eq.m1");
    expect(url.searchParams.get("move_count")).toBe("eq.4");
    expect(url.searchParams.get("finished")).toBe("eq.false");
    expect(body).toMatchObject({ move_count: 5 });
    expect(body).not.toHaveProperty("finished");
  });

  it("a move that came second is a conflict", async () => {
    const { store } = fakeDb(() => ({ status: 200, body: [] }));
    expect(await store.saveMove("m1", 4, [[40, 33]], { winnerId: "p1", reason: "board" }, new Date())).toBe("conflict");
    expect(await store.finishMatch("m1", { winnerId: "p1", reason: "resign" }, new Date())).toBe("conflict");
  });

  it("a code or a seat taken first (a unique key) is answered, not thrown", async () => {
    const { store } = fakeDb(() => ({ status: 409, body: { code: "23505" } }));
    expect(await store.createRoom({ code: "ABCDEF", hostId: "p1", deviceHash: "d", at: new Date() }, { playerId: "p1", username: "H", avatar: null, country: null })).toBe("codeTaken");
    expect(await store.addMember("r1", { playerId: "p2", username: "G", avatar: null, country: null }, new Date())).toBe("full");
    expect(await store.startMatch({ roomId: "r1", number: 1, blackId: "p1", whiteId: "p2", startsAt: new Date() })).toBe("exists");
  });

  it("other errors carry only their code", async () => {
    const { store } = fakeDb(() => ({ status: 500, body: { code: "57014", message: "canceling statement ABCDEF" } }));
    const error = (await store.snapshot("ABCDEF").catch((caught: unknown) => caught)) as Error & { code: string };
    expect(error.code).toBe("57014");
    expect(error.message).not.toContain("ABCDEF");
  });

  it("asks for a rematch only when nobody asked yet, then reads who did", async () => {
    const { seen, store } = fakeDb((request) => ({ status: 200, body: request.method === "PATCH" ? [] : { rematch_by: "p2" } }));
    expect(await store.requestRematch("r1", "p1")).toBe("p2");
    expect(seen[0]!.url.searchParams.get("rematch_by")).toBe("is.null");
  });

  it("cleans up with cut off times worked out from the handler's clock", async () => {
    const { seen, store } = fakeDb(() => ({ status: 200, body: null }));
    await store.cleanup(new Date("2026-11-18T12:00:00Z"), 30, 180);
    expect(seen[0]!.url.pathname).toBe("/rest/v1/rpc/online_cleanup");
    expect(seen[0]!.body).toEqual({ p_rooms_before: "2026-10-19T12:00:00.000Z", p_reports_before: "2026-05-22T12:00:00.000Z" });
  });

  it("counts open rooms by the player or the device", async () => {
    const { seen, store } = fakeDb(() => ({ status: 200, body: [], headers: { "content-range": "0-0/2" } }));
    expect(await store.openRoomCount("p1", "abc123", new Date("2026-11-17T12:00:00Z"))).toBe(2);
    expect(seen[0]!.url.searchParams.get("or")).toBe("(host_id.eq.p1,device_hash.eq.abc123)");
    expect(seen[0]!.url.searchParams.get("closed_at")).toBe("is.null");
  });
});
