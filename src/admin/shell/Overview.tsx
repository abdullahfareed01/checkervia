// The overview: read-only statistics and charts (D103), laid out like the
// owner's mockup (D111). Recent admin activity lives in the Audit Log.
import { OverviewStats } from "./OverviewStats";

export function Overview() {
  return <div className="adm-overview"><OverviewStats /></div>;
}
