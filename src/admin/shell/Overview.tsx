// The overview: read-only statistics and charts (D103), plus the account
// and recent audit activity from phase 1.
import { useEffect, useState } from "react";
import { OverviewStats } from "./OverviewStats";
import { problemText } from "../api";
import type { AuditRow, Page } from "../protocol";
import { adminCall, useSession } from "../session";
import { actionLabel, dateTime } from "./format";
import { SECTIONS } from "./sections";
import type { Section } from "./sections";

type Activity = { kind: "loading" } | { kind: "ok"; rows: readonly AuditRow[] } | { kind: "problem"; text: string };

function RecentActivity() {
  const [activity, setActivity] = useState<Activity>({ kind: "loading" });
  const load = () => {
    setActivity({ kind: "loading" });
    void adminCall<Page<AuditRow>>("audit", { limit: 8 }).then((answer) =>
      setActivity(answer.kind === "ok" ? { kind: "ok", rows: answer.value.rows } : { kind: "problem", text: problemText(answer) }),
    );
  };
  useEffect(load, []);

  return (
    <section className="adm-panel" aria-labelledby="adm-activity" aria-busy={activity.kind === "loading"}>
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

export function Overview({ email, onGo }: { email: string; onGo: (section: Section) => void }) {
  const session = useSession();
  const ends = session.status === "signedIn" ? new Date(session.expiresAt * 1000).toISOString() : null;
  return (
    <div className="adm-overview">
      <OverviewStats />
      <div className="adm-grid">
      <section className="adm-panel" aria-labelledby="adm-signed-in">
        <h2 id="adm-signed-in" className="adm-panel-title">
          Signed in
        </h2>
        <dl className="adm-facts">
          <div>
            <dt>Account</dt>
            <dd className="adm-break">{email}</dd>
          </div>
          <div>
            <dt>Second step</dt>
            <dd>Authenticator app</dd>
          </div>
          <div>
            <dt>Access renews</dt>
            <dd className="adm-num">{ends ? dateTime(ends) : "?"}</dd>
          </div>
        </dl>
        <p className="adm-dim">You are signed out after 30 minutes without use, and after 12 hours in any case.</p>
      </section>
      <RecentActivity />
      <section className="adm-panel adm-wide" aria-labelledby="adm-next">
        <h2 id="adm-next" className="adm-panel-title">
          Sections
        </h2>
        <ul className="adm-section-list">
          {SECTIONS.slice(1).map((section) => (
            <li key={section.id}>
              <button type="button" className="adm-section-card" onClick={() => onGo(section)}>
                <span className="adm-section-name">{section.label}</span>
                <span className="adm-dim">{section.about}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      </div>
    </div>
  );
}
