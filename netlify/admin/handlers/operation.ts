// POST admin-api { op, params }: every dashboard operation after sign in.
// The guard runs first (requireAdmin: own page, rate limit, token, admin
// email, second factor, allow list); then the operation checks its own
// params. Reads and writes have their own rate limits; writes (phase 3)
// always carry a reason and write their audit row in the same database step.
import { fail, guarded, invalid, parseBody } from "../http";
import type { AdminDeps, AdminRequest, AdminResponse } from "../http";
import { requireAdmin } from "../guard";
import type { AdminIdentity } from "../guard";
import { ADMIN_BODY_MAX, ADMIN_LIMITS } from "../limits";

export interface AdminOperation {
  readonly kind: "read" | "write";
  readonly keys: readonly string[]; // the params it accepts
  run(params: Record<string, unknown>, admin: AdminIdentity, deps: AdminDeps): Promise<AdminResponse>;
}

/** Makes the admin-api handler for a table of operations. */
export function adminApi(operations: Readonly<Record<string, AdminOperation>>) {
  return (request: AdminRequest, deps: AdminDeps): Promise<AdminResponse> =>
    guarded("api", deps, async () => {
      if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
      const body = parseBody(request.body, ADMIN_BODY_MAX.api, ["op", "params"]);
      const op = typeof body?.["op"] === "string" && Object.hasOwn(operations, body["op"]) ? operations[body["op"]] : undefined;
      const params = body?.["params"] ?? {};
      if (!op || typeof params !== "object" || params === null || Array.isArray(params)) return invalid();
      const keys = Object.keys(params);
      if (!keys.every((key) => op.keys.includes(key))) return invalid();

      const checked = await requireAdmin(request, deps, op.kind, op.kind === "read" ? ADMIN_LIMITS.read : ADMIN_LIMITS.write);
      if ("response" in checked) return checked.response;
      return op.run(params as Record<string, unknown>, checked.admin, deps);
    });
}
