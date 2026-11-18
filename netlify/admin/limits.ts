// Rate limits for the admin functions, per fixed window, in one place. A
// refused request still counts, so guessing a password or a code waits
// until the window ends. Supabase Auth has limits of its own on top.
import type { AdminLimit } from "./http";

export const ADMIN_LIMITS = {
  // Password tries: 8 per 15 minutes from one address.
  signIn: { windowSeconds: 900, perIp: 8 },
  // Authenticator codes and set up: 6 per 15 minutes, per address and per account.
  secondFactor: { windowSeconds: 900, perIp: 6, perUser: 6 },
  refresh: { windowSeconds: 3600, perIp: 120 },
  signOut: { windowSeconds: 3600, perIp: 60 },
  // Reading the dashboard, and actions that change something.
  read: { windowSeconds: 60, perIp: 240, perUser: 120 },
  write: { windowSeconds: 60, perIp: 60, perUser: 30 },
} satisfies Record<string, AdminLimit>;

export const ADMIN_BODY_MAX = {
  auth: 400,
  api: 4000,
};
