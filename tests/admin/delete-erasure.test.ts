// Deleting a profile from the dashboard also removes its saved email (D150):
// the cascade queues the Auth user, and the admin function then deletes it.
import { describe, expect, it } from "vitest";
import { handleAdminApi } from "../../netlify/admin/api";
import { adminToken, bearer, deps, fakeStore, request } from "./fakes";

const PLAYER = "55555555-5555-4555-8555-000000000009";
const REASON = "Asked for the profile to be removed";

function world(deleted: boolean) {
  const store = fakeStore({ deletePlayer: async () => deleted });
  const erased: string[] = [];
  const w = { ...deps(store), afterPlayerDeleted: async () => { erased.push("drained"); } };
  const token = adminToken();
  w.auth.state.valid.add(token);
  const call = () => handleAdminApi(request({ op: "deletePlayer", params: { playerId: PLAYER, confirm: true, reason: REASON } }, bearer(token)), w);
  return { erased, call };
}

describe("deleting a profile", () => {
  it("removes the saved email after the profile is gone", async () => {
    const { erased, call } = world(true);
    expect((await call()).status).toBe(200);
    expect(erased).toEqual(["drained"]);
  });
  it("does nothing more when there was no such profile", async () => {
    const { erased, call } = world(false);
    expect((await call()).status).not.toBe(200);
    expect(erased).toEqual([]);
  });
});
