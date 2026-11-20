// Players and the admin share Supabase Auth's user list once progress can be
// saved to an email (D150). Being signed in is never enough for the admin:
// a valid session of a player, even one with a second factor, is refused by
// every admin operation and every step of the admin sign in.
import { describe, expect, it } from "vitest";
import { ADMIN_OPERATIONS, handleAdminApi } from "../../netlify/admin/api";
import { handleAdminAuth } from "../../netlify/admin/handlers/auth";
import { FACTOR_ID, adminToken, bearer, deps, request, token } from "./fakes";

const PLAYER_ID = "44444444-4444-4444-8444-444444444444";
const PLAYER_EMAIL = "player@example.com";
const now = Date.parse("2026-11-16T12:00:00Z") / 1000;

function world() {
  const w = deps();
  w.auth.state.users.set(PLAYER_ID, { id: PLAYER_ID, email: PLAYER_EMAIL, factors: [{ id: FACTOR_ID, type: "totp", status: "verified" }] });
  // As Supabase would issue them: a plain code session, and one with a second factor.
  const plain = token({ sub: PLAYER_ID, email: PLAYER_EMAIL, aal: "aal1", amr: [{ method: "otp", timestamp: now - 10 }] }, "player");
  const strong = adminToken({ sub: PLAYER_ID, email: PLAYER_EMAIL });
  w.auth.state.valid.add(plain);
  w.auth.state.valid.add(strong);
  return { w, sessions: [plain, strong] };
}

describe("a player's Supabase session", () => {
  it("is refused by every admin operation", async () => {
    const { w, sessions } = world();
    const operations = Object.keys(ADMIN_OPERATIONS);
    expect(operations.length).toBeGreaterThanOrEqual(20);
    for (const session of sessions) {
      for (const op of operations) {
        const answer = await handleAdminApi(request({ op, params: {} }, bearer(session)), w);
        expect([401, 403], `${op}`).toContain(answer.status);
        expect(answer.status === 403 ? (answer.body as { code: string }).code : "noSession", op).toMatch(/notAdmin|mfaRequired|noSession/);
      }
    }
    // Refusals of a real account are written to the audit log, and nothing was read or changed.
    expect(w.store.state.logs.length).toBeGreaterThan(0);
    expect(w.store.state.logs.every((entry) => entry.outcome === "refused")).toBe(true);
  });

  it("cannot pass any step of the admin sign in", async () => {
    const { w, sessions } = world();
    expect((await handleAdminAuth(request({ action: "signIn", email: PLAYER_EMAIL, password: "anything" }), w)).status).toBe(401);
    for (const session of sessions) {
      for (const action of ["enroll", "verify"]) {
        const answer = await handleAdminAuth(request({ action, code: "123456", factorId: FACTOR_ID }, bearer(session)), w);
        expect([401, 403], action).toContain(answer.status);
      }
    }
  });
});
