// Fakes for the admin handler tests: Supabase Auth (tokens are made up JWTs
// whose claims the fake knows), the admin store (rate limits counted per
// key, the allow list, the audit rows kept in memory) and requests.
import type { AuthApi, AuthFactor, AuthSession, AuthUser } from "../../netlify/admin/gotrue";
import type { AdminDeps, AdminRequest } from "../../netlify/admin/http";
import type { AdminStore, AuditEntry } from "../../netlify/admin/store";

export const ADMIN_EMAIL = "owner@example.com";
export const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_ID = "22222222-2222-4222-8222-222222222222";
export const FACTOR_ID = "33333333-3333-4333-8333-333333333333";
export const NOW = new Date("2026-11-16T12:00:00Z");
const nowSeconds = NOW.getTime() / 1000;

const base64Url = (text: string) => btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text: string) => atob(text.replace(/-/g, "+").replace(/_/g, "/"));

/** A token with these claims, in a JWT's shape (the fake decides if it is valid). */
export function token(claims: Record<string, unknown>, tag = "sig"): string {
  return `${base64Url(JSON.stringify({ alg: "ES256" }))}.${base64Url(JSON.stringify(claims))}.${base64Url(tag)}`;
}

export const passwordToken = (sub = ADMIN_ID, email = ADMIN_EMAIL) => token({ sub, email, aal: "aal1", amr: [{ method: "password", timestamp: nowSeconds - 10 }] }, "password");
export const adminToken = (options: { sub?: string; email?: string; totpAt?: number; aal?: string } = {}) =>
  token({
    sub: options.sub ?? ADMIN_ID,
    email: options.email ?? ADMIN_EMAIL,
    aal: options.aal ?? "aal2",
    amr: [
      { method: "totp", timestamp: options.totpAt ?? nowSeconds - 60 },
      { method: "password", timestamp: nowSeconds - 90 },
    ],
  });

export interface FakeAuthState {
  valid: Set<string>; // tokens Supabase accepts
  users: Map<string, AuthUser>; // by user id
  password: string;
  code: string;
  signupsDisabled: boolean | null;
  calls: string[];
  enrolled: number;
}

export function fakeAuth(overrides: Partial<FakeAuthState> = {}): AuthApi & { state: FakeAuthState } {
  const verified: AuthFactor = { id: FACTOR_ID, type: "totp", status: "verified" };
  const state: FakeAuthState = {
    valid: new Set(),
    users: new Map([
      [ADMIN_ID, { id: ADMIN_ID, email: ADMIN_EMAIL, factors: [verified] }],
      [OTHER_ID, { id: OTHER_ID, email: "someone@example.com", factors: [verified] }],
    ]),
    password: "correct horse battery staple",
    code: "123456",
    signupsDisabled: true,
    calls: [],
    enrolled: 0,
    ...overrides,
  };
  const subOf = (value: string) => JSON.parse(fromBase64Url(value.split(".")[1]!)).sub as string;
  const session = (access: string, refresh: string): AuthSession => ({ accessToken: access, refreshToken: refresh, expiresAt: nowSeconds + 3600 });
  const issue = (access: string, refresh: string) => {
    state.valid.add(access);
    state.valid.add(`refresh:${refresh}`);
    return session(access, refresh);
  };
  return {
    state,
    async signIn(email, password) {
      state.calls.push(`signIn ${email}`);
      if (email !== ADMIN_EMAIL || password !== state.password) return { ok: false, status: 400, code: "invalid_credentials" };
      return { ok: true, value: issue(passwordToken(), "refreshpassword1") };
    },
    async refresh(refreshToken) {
      state.calls.push("refresh");
      if (!state.valid.has(`refresh:${refreshToken}`)) return { ok: false, status: 400, code: "refresh_token_not_found" };
      state.valid.delete(`refresh:${refreshToken}`);
      return { ok: true, value: issue(adminToken({ totpAt: nowSeconds - 120 }), `rotated${state.calls.length}abcdef`) };
    },
    async user(accessToken) {
      state.calls.push("user");
      if (!state.valid.has(accessToken)) return { ok: false, status: 403, code: "bad_jwt" };
      const user = state.users.get(subOf(accessToken));
      return user ? { ok: true, value: user } : { ok: false, status: 404, code: "user_not_found" };
    },
    async enrollTotp(accessToken) {
      state.calls.push("enroll");
      const user = state.users.get(subOf(accessToken))!;
      state.enrolled++;
      const factor: AuthFactor = { id: `44444444-4444-4444-8444-44444444444${state.enrolled}`, type: "totp", status: "unverified" };
      state.users.set(user.id, { ...user, factors: [...user.factors, factor] });
      return { ok: true, value: { factorId: factor.id, qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DPEHPK3PXP" } };
    },
    async deleteFactor(accessToken, factorId) {
      state.calls.push(`deleteFactor ${factorId}`);
      const user = state.users.get(subOf(accessToken))!;
      state.users.set(user.id, { ...user, factors: user.factors.filter((factor) => factor.id !== factorId) });
      return { ok: true, value: null };
    },
    async verifyTotp(accessToken, factorId, code) {
      state.calls.push(`verify ${factorId}`);
      if (code !== state.code) return { ok: false, status: 422, code: "mfa_verification_failed" };
      const user = state.users.get(subOf(accessToken))!;
      state.users.set(user.id, { ...user, factors: user.factors.map((factor) => (factor.id === factorId ? { ...factor, status: "verified" } : factor)) });
      return { ok: true, value: issue(adminToken(), "refreshadmin12345") };
    },
    async signOut(accessToken) {
      state.calls.push("signOut");
      state.valid.delete(accessToken);
      return { ok: true, value: null };
    },
    async signupsDisabled() {
      return state.signupsDisabled;
    },
  };
}

export interface FakeStoreState {
  hits: Map<string, number>;
  limits: Map<string, number>; // key prefix to a lower limit, for tests
  allowList: Map<string, { email: string; enrollOpen: boolean }>;
  logs: AuditEntry[];
  closed: string[];
}

export function fakeStore(overrides: Partial<AdminStore> = {}): AdminStore & { state: FakeStoreState } {
  const state: FakeStoreState = {
    hits: new Map(),
    limits: new Map(),
    allowList: new Map([[ADMIN_ID, { email: ADMIN_EMAIL, enrollOpen: false }]]),
    logs: [],
    closed: [],
  };
  return {
    state,
    async hitRateLimit(key, windowSeconds, limit) {
      const hits = (state.hits.get(key) ?? 0) + 1;
      state.hits.set(key, hits);
      const lower = [...state.limits].find(([prefix]) => key.startsWith(prefix))?.[1];
      return { allowed: hits <= (lower ?? limit), retryAfterSeconds: windowSeconds };
    },
    async gate(userId, email) {
      const entry = state.allowList.get(userId);
      return entry && entry.email === email.toLowerCase() ? { allowed: true, enrollOpen: entry.enrollOpen } : { allowed: false, enrollOpen: false };
    },
    async closeEnrollment(userId) {
      state.closed.push(userId);
      const entry = state.allowList.get(userId);
      if (entry) state.allowList.set(userId, { ...entry, enrollOpen: false });
    },
    async log(entry) {
      state.logs.push(entry);
    },
    overview: async (range) => ({
      range,
      totals: { registered: 0, newPlayers: 0, visitors: 0, visitorsToday: 0, onlineNow: 0, games: 0,
        onlineGames: 0, resigned: 0, abandoned: 0, openReports: 0, suspended: 0, levels: [] },
      daily: [], weekly: [], previous: null,
    }),
    players: async () => [],
    countries: async (range) => ({ range, rows: [] }),
    winners: async (range, level) => ({ range, level, rows: [], top: [], levels: [] }),
    resigned: async (range) => ({ range, levels: [], daily: [], rows: [] }),
    playerDetail: async () => null,
    audit: async () => [],
    reports: async () => [],
    reportGroups: async () => [],
    live: async () => ({ online: 0, modes: {}, levels: {}, countries: [], roomGames: [], rooms: false }),
    setReportStatus: async () => true,
    suspend: async (_c, _id, until) => until?.toISOString() ?? "9999-12-31T00:00:00.000Z",
    unsuspend: async () => true,
    deviceBan: async () => true,
    hidePlayer: async () => true,
    hideWin: async () => true,
    rename: async () => "renamed",
    resetProfile: async () => true,
    deletePlayer: async () => true,
    ...overrides,
  };
}

export function deps(store = fakeStore(), auth = fakeAuth()): AdminDeps & { store: typeof store; auth: typeof auth; logged: string[] } {
  const logged: string[] = [];
  return { store, auth, adminEmail: ADMIN_EMAIL, salt: "test salt", now: () => NOW, log: (message) => logged.push(message), logged };
}

export function request(body: unknown, headers: Record<string, string> = {}, ip = "203.0.113.7"): AdminRequest {
  return {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "x-checkervia-admin": "1", host: "checkervia.example", origin: "https://checkervia.example", "sec-fetch-site": "same-origin", ...headers },
    ip,
  };
}

export const bearer = (value: string) => ({ authorization: `Bearer ${value}` });
