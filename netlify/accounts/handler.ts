// The account function (D150): GET ?action=status|load, and POST with an
// action for the code steps, saving, logging out and removing the email.
// Until the owner switches accounts on, only `status` answers (enabled false)
// and the game shows nothing new: guest play and profiles work as before.
import { fail, guarded, invalid, parseBody } from "../leaderboard/http";
import { requestCode, verifyCode } from "./codes";
import { MAX_ACCOUNT_BODY } from "./deps";
import type { AccountHandler } from "./deps";
import { load, logout, save, status, unlink } from "./saves";

const KEYS = ["action", "email", "code", "purpose", "collection", "settings"];

export const handleAccount: AccountHandler = (request, deps) =>
  guarded("account", deps, async () => {
    const action = request.method === "GET" ? request.query.get("action") : null;
    if (!deps.enabled) {
      return action === "status" ? { status: 200, body: { enabled: false, linked: false, emailHint: null } } : fail(503, "accountsOff", "Saving progress is not available yet.");
    }
    if (request.method === "GET") {
      if (action === "status") return status(request, deps);
      if (action === "load") return load(request, deps);
      return invalid();
    }
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    const body = parseBody(request.body, MAX_ACCOUNT_BODY, KEYS);
    if (!body) return invalid();
    switch (body["action"]) {
      case "requestCode": return requestCode(body, request, deps);
      case "verify": return verifyCode(body, request, deps);
      case "save": return save(body, request, deps);
      case "logout": return logout(request, deps);
      case "unlink": return unlink(request, deps);
      default: return invalid();
    }
  });
