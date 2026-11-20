// Saved progress in Postgres (migration 9) through the server's secret key.
// Every failure is thrown with only its Postgres code, like the leaderboard.
import { PLAYER_COLUMNS, StoreError, check, serviceClient, toPlayer } from "../leaderboard/supabaseStore";
import type { PlayerRow } from "../leaderboard/supabaseStore";
import type { AccountLink, AccountStore, CodeRequest } from "./store";

interface LinkRow { player_id: string; auth_user_id: string; email_hash: string; email_hint: string }
interface CodeRow { email_hash: string; auth_user_id: string | null; created_user: boolean; requested_at: string; wrong_attempts: number; used: boolean }
const LINK_COLUMNS = "player_id, auth_user_id, email_hash, email_hint";
const toLink = (row: LinkRow): AccountLink => ({ playerId: row.player_id, authUserId: row.auth_user_id, emailHash: row.email_hash, emailHint: row.email_hint });
const toCode = (row: CodeRow): CodeRequest => ({
  emailHash: row.email_hash, authUserId: row.auth_user_id, createdUser: row.created_user, requestedAt: new Date(row.requested_at), wrongAttempts: Number(row.wrong_attempts), used: row.used,
});

export function createSupabaseAccountStore(url: string, serviceRoleKey: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): AccountStore {
  const db = serviceClient(url, serviceRoleKey, fetchImpl);
  async function oneLink(column: "player_id" | "auth_user_id" | "email_hash", value: string): Promise<AccountLink | null> {
    const row = check(await db.from("player_accounts").select(LINK_COLUMNS).eq(column, value).maybeSingle<LinkRow>());
    return row ? toLink(row) : null;
  }
  async function code(emailHash: string): Promise<CodeRequest | null> {
    const row = check(await db.from("account_codes").select("*").eq("email_hash", emailHash).maybeSingle<CodeRow>());
    return row ? toCode(row) : null;
  }

  return {
    linkOfPlayer: (playerId) => oneLink("player_id", playerId),
    linkOfUser: (authUserId) => oneLink("auth_user_id", authUserId),
    linkOfEmail: (emailHash) => oneLink("email_hash", emailHash),
    async link(link) {
      const outcome = check(await db.rpc("account_link", { p_player: link.playerId, p_auth_user: link.authUserId, p_email_hash: link.emailHash, p_email_hint: link.emailHint }));
      if (outcome !== "linked" && outcome !== "emailTaken" && outcome !== "profileLinked") throw new StoreError("badOutcome");
      return outcome;
    },
    async unlink(playerId) {
      check(await db.from("player_saves").delete().eq("player_id", playerId));
      const rows = check(await db.from("player_accounts").delete().eq("player_id", playerId).select("player_id"));
      return (rows ?? []).length > 0;
    },
    async playerById(playerId) {
      const row = check(await db.from("players").select(PLAYER_COLUMNS).eq("id", playerId).maybeSingle<PlayerRow>());
      return row ? toPlayer(row) : null;
    },
    async addDeviceToken(playerId, tokenHash, deviceHash) {
      check(await db.from("player_tokens").insert({ token_hash: tokenHash, player_id: playerId, device_hash: deviceHash }));
    },
    async removeDeviceToken(tokenHash) {
      const rows = check(await db.from("player_tokens").delete().eq("token_hash", tokenHash).select("token_hash"));
      return (rows ?? []).length > 0;
    },
    async replaceFirstToken(playerId, tokenHash) {
      check(await db.from("players").update({ token_hash: tokenHash }).eq("id", playerId));
    },
    async saved(playerId) {
      const row = check(await db.from("player_saves").select("collection, settings, updated_at").eq("player_id", playerId).maybeSingle<{ collection: unknown; settings: unknown; updated_at: string }>());
      return row ? { collection: row.collection, settings: row.settings, updatedAt: new Date(row.updated_at) } : null;
    },
    async putSaved(playerId, collection, settings) {
      const updatedAt = new Date();
      check(await db.from("player_saves").upsert({ player_id: playerId, collection, settings, updated_at: updatedAt.toISOString() }));
      return updatedAt;
    },
    code,
    async putCode(request) {
      check(await db.from("account_codes").upsert({
        email_hash: request.emailHash, auth_user_id: request.authUserId, created_user: request.createdUser,
        requested_at: request.requestedAt.toISOString(), wrong_attempts: request.wrongAttempts, used: request.used,
      }));
    },
    async wrongCode(emailHash) {
      const current = await code(emailHash);
      if (!current) return 0;
      const attempts = current.wrongAttempts + 1;
      check(await db.from("account_codes").update({ wrong_attempts: attempts }).eq("email_hash", emailHash));
      return attempts;
    },
    async useCode(emailHash) {
      check(await db.from("account_codes").update({ used: true }).eq("email_hash", emailHash));
    },
    async queueStaleCodes(before) {
      return Number(check(await db.rpc("account_queue_stale_codes", { p_before: before.toISOString() })) ?? 0);
    },
    async erasures(limit) {
      const rows = check(await db.from("account_erasures").select("auth_user_id").order("queued_at").limit(limit));
      return (rows ?? []).map((row: { auth_user_id: string }) => row.auth_user_id);
    },
    async erased(authUserId) {
      check(await db.from("account_erasures").delete().eq("auth_user_id", authUserId));
    },
  };
}
