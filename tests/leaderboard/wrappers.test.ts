// The Netlify wrappers before the owner has set the Supabase variables:
// every function answers the calm 503, and the log names the variables, never values.
import { afterEach, describe, expect, it, vi } from "vitest";
import checkUsername from "../../netlify/functions/check-username";
import claimUsername from "../../netlify/functions/claim-username";
import getLeaderboard from "../../netlify/functions/get-leaderboard";
import getProfile from "../../netlify/functions/get-profile";
import reportGame from "../../netlify/functions/report-game";
import submitWin from "../../netlify/functions/submit-win";
import updateProfile from "../../netlify/functions/update-profile";
import getAiStats from "../../netlify/functions/get-ai-stats";

afterEach(() => vi.restoreAllMocks());

describe("leaderboard functions without configuration", () => {
  it.each([
    ["check-username", checkUsername, "GET"],
    ["claim-username", claimUsername, "POST"],
    ["submit-win", submitWin, "POST"],
    ["report-game", reportGame, "POST"],
    ["get-leaderboard", getLeaderboard, "GET"],
    ["get-profile", getProfile, "GET"],
    ["update-profile", updateProfile, "POST"],
    ["get-ai-stats", getAiStats, "GET"],
  ] as const)("%s answers 503 as JSON", async (name, handler, method) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new Request(`https://example.test/.netlify/functions/${name}`, { method, ...(method === "POST" ? { body: "{}" } : {}) });
    const response = await handler(request);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "The leaderboard is not available right now.", code: "unavailable" });
    expect(errors).toHaveBeenCalledWith("leaderboard: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or LEADERBOARD_HASH_SALT is not set");
  });
});
