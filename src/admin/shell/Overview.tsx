// The overview: read-only statistics and charts (D103), then recent audit
// activity. D109: the account moved to the side bar, and the section cards
// (the same list as the menu) were removed to keep the page short.
import { useEffect, useState } from "react";
import { OverviewStats } from "./OverviewStats";
import { problemText } from "../api";
import type { AuditRow, Page } from "../protocol";
import { adminCall } from "../session";
import { actionLabel, dateTime } from "./format";

type Activity = { kind: "loading" } | { kind: "ok"; rows: readonly AuditRow[] } | { kind: "problem"; text: string };

function RecentActivity() {
  const [activity, setActivity] = useState<Activity>({ kind: "loading" });
  const load = () => {
    setActivity({ kind: "loading" });
    void adminCall<Page<AuditRow>>("audit", { limit: 6 }).then((answer) =>
      setActivity(answer.kind === "ok" ? { kind: "ok", rows: answer.value.rows } : { kind: "problem", text: problemText(answer) }),
    );
  };
  useEffect(load, []);

  return (
    <section className="adm-panel adm-activity-panel" aria-labelledby="adm-activity" aria-busy={activity.kind === "loading"}>
      <div className="adm-panel-head">
        <h2 id="adm-activity" className="adm-panel-title">
          Recent admin activity
        </h2>
        <button type="button" className="adm-button adm-button-quiet" onClick={load} disabled={activity.kind === "loading"}>
          Refresh
        </button>
      </div>
      {activity.kind === "loading" ? (
        <p className="adm-dim">Loading</p>
      ) : activity.kind === "problem" ? (
        <p className="adm-problem" role="alert">
          {activity.text}
        </p>
      ) : activity.rows.length === 0 ? (
        <p className="adm-dim">Nothing recorded yet.</p>
      ) : (
        <ol className="adm-activity">
          {activity.rows.map((row) => (
            <li key={row.id} className="adm-activity-row">
              <span className={`adm-badge adm-badge-${row.outcome}`}>{row.outcome === "ok" ? "Done" : row.outcome === "refused" ? "Refused" : "Failed"}</span>
              <span className="adm-activity-what">
                {actionLabel(row.action)}
                {row.targetLabel ? <span className="adm-dim"> {row.targetLabel}</span> : null}
              </span>
              <time className="adm-activity-time adm-num" dateTime={row.at}>
                {dateTime(row.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Overview() {
  return (
    <div className="adm-overview">
      <OverviewStats />
      <RecentActivity />
    </div>
  );
}
