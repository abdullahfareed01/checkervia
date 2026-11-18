// A bounded, read-only summary behind the same MFA guard as every admin call.
import { OVERVIEW_PERIODS, overviewRange } from "../../../src/admin/analytics";
import type { OverviewPeriod } from "../../../src/admin/analytics";
import { invalid, ok } from "../http";
import type { AdminOperation } from "./operation";

export const overviewOperation: AdminOperation = {
  kind: "read",
  keys: ["period"],
  async run(params, _admin, deps) {
    const period = params["period"] === undefined ? "30" : params["period"];
    if (!OVERVIEW_PERIODS.includes(period as OverviewPeriod)) return invalid();
    return ok(await deps.store.overview(overviewRange(period as OverviewPeriod, deps.now())));
  },
};
