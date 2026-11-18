import { OVERVIEW_PERIODS, overviewRange } from "../../../src/admin/analytics";
import type { OverviewPeriod } from "../../../src/admin/analytics";
import { invalid, ok } from "../http";
import type { AdminOperation } from "./operation";

// Only fixed UTC periods are accepted. Limits are server controlled, and
// every operation retains the existing admin and second factor guard.
export function reportOperation(kind: "countries" | "winners" | "resigned"): AdminOperation {
  return {
    kind: "read", keys: kind === "winners" ? ["period", "level"] : ["period"],
    async run(params, _admin, deps) {
      const period = params["period"] === undefined ? "30" : params["period"];
      if (!OVERVIEW_PERIODS.includes(period as OverviewPeriod)) return invalid();
      const range = overviewRange(period as OverviewPeriod, deps.now());
      if (kind === "winners") {
        const level = params["level"] === undefined ? 1 : params["level"];
        if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 4) return invalid();
        return ok(await deps.store.winners(range, level));
      }
      return ok(await deps.store[kind](range));
    },
  };
}
