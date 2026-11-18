// A player's profile (D57, D62), opened by tapping their row or podium card:
// avatar, username, flag, the stats cards and wins by level, in the look of
// mockup/Leader_board.png (right), 2nd_ranked.png and 3rd_ranked.png. The
// top three on the tab it was opened from get the matching card: gold with
// the crown and "Top ranked player", silver "Second ranked player", bronze
// "Third ranked player". Everyone else gets the plain card.
//
// The sheet is a dialog over the leaderboard; the layer behind it scrolls,
// the card itself never does (one scroll only).
import { useEffect, useId, useRef, useState } from "react";
import { AI_LEVELS } from "../../ai/difficulty";
import type { ProfileResponse } from "../../leaderboard/protocol";
import { leaderboardApi } from "./api";
import { Avatar } from "./Avatar";
import { Flag, countryName } from "./Flag";
import {
  CloseIcon,
  LbBars,
  LbCrown,
  LbGamepad,
  LbGradients,
  LbLaurel,
  LbMountains,
  LbStar,
  LbSwords,
  LbTarget,
  LbTrophy,
  LevelCrown,
} from "./lbIcons";
import type { Tone } from "./lbIcons";
import { longDate } from "../ConductDialogs";
import { useShownConduct } from "../conduct";
import { FlagIcon } from "../icons";
import { useLeaderboardProfile } from "./profile";
import { ProblemPanel, problemOf } from "./Problem";
import type { Problem } from "./Problem";

type Loaded = { kind: "loading" } | { kind: "problem"; problem: Problem } | { kind: "missing" } | { kind: "ready"; profile: ProfileResponse };

export type Tier = 1 | 2 | 3 | null;

export const TIERS: Record<1 | 2 | 3, { label: string; tone: Tone; className: string }> = {
  1: { label: "Top ranked player", tone: "gold", className: "top-ranked-player-card" },
  2: { label: "Second ranked player", tone: "silver", className: "second-ranked-player-card" },
  3: { label: "Third ranked player", tone: "bronze", className: "third-ranked-player-card" },
};

export const tierOf = (rank: number | null): Tier => (rank === 1 || rank === 2 || rank === 3 ? rank : null);

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/** The ribbon over a top three card: a crown, laurels and "#1 Top ranked player". */
export function TierRibbon({ tier }: { tier: 1 | 2 | 3 }) {
  const { label, tone } = TIERS[tier];
  return (
    <div className="lb-ribbon-wrap" aria-hidden="true">
      <div className="lb-ribbon-crown">
        <span className="lb-ribbon-laurel">
          <LbLaurel tone={tone} />
        </span>
        <LbCrown tone={tone} jewel={tier === 2 ? "#2f6fe0" : "#d3263a"} />
        <span className="lb-ribbon-laurel">
          <LbLaurel tone={tone} flip />
        </span>
      </div>
      <div className="lb-ribbon">
        <span className="lb-ribbon-text">
          <span className="lb-num">#{tier}</span> {label}
        </span>
      </div>
    </div>
  );
}

/** Avatar in its ring with laurels, the name with the flag, and the country. */
export function ProfileHeader({
  username,
  country,
  avatar,
  tone,
  mine,
  titleId,
}: {
  username: string;
  country: string | null;
  avatar: string | null;
  tone: Tone;
  mine: boolean;
  titleId: string;
}) {
  return (
    <div className="lb-hero-head">
      <div className={`lb-hero-avatar lb-ring-${tone}`}>
        <span className="lb-hero-laurel lb-hero-laurel-left" aria-hidden="true">
          <LbLaurel tone={tone} />
        </span>
        <Avatar id={avatar} size={96} />
        <span className="lb-hero-laurel lb-hero-laurel-right" aria-hidden="true">
          <LbLaurel tone={tone} flip />
        </span>
      </div>
      <div className="lb-hero-who">
        <h2 id={titleId} className="lb-hero-name">
          <Flag code={country} decorative />
          <span className="lb-name">{username}</span>
        </h2>
        <p className="lb-hero-country">
          {countryName(country)}
          {mine && <span className="lb-you">You</span>}
        </p>
      </div>
    </div>
  );
}

export function ProfileSheet({ username, rank = null, onClose }: { username: string; rank?: number | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { profile: own } = useLeaderboardProfile();
  const mine = own !== null && own.username.toLowerCase() === username.toLowerCase();
  const ids = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const tier = tierOf(rank);
  const tone: Tone = tier ? TIERS[tier].tone : "gold";

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded({ kind: "loading" });
    leaderboardApi
      .profile(username, controller.signal)
      .then((result) => {
        if (result.kind === "ok") setLoaded({ kind: "ready", profile: result.value });
        else setLoaded(result.kind === "failed" && result.status === 404 ? { kind: "missing" } : { kind: "problem", problem: problemOf(result) });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [username, attempt]);

  const shown = loaded.kind === "ready" ? loaded.profile : null;
  const country = mine ? own.country : (shown?.country ?? null);
  const avatar = mine ? own.avatar : (shown?.avatar ?? null);

  return (
    <div className="lb-sheet-backdrop" onClick={onClose}>
      <LbGradients />
      <div
        className={`lb-hero lb-sheet ${tier ? TIERS[tier].className : "lb-hero-plain"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        {tier && <TierRibbon tier={tier} />}
        <div className="lb-hero-card">
          <button ref={closeRef} type="button" className="lb-close lb-hero-close" aria-label="Close the profile" onClick={onClose}>
            <CloseIcon />
          </button>
          <ProfileHeader username={shown?.username ?? username} country={country} avatar={avatar} tone={tone} mine={mine} titleId={`${ids}-title`} />
          {tier && <p className="sr-only">{TIERS[tier].label}</p>}

          {loaded.kind === "loading" && (
            <>
              <div className="lb-stats-skeleton" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <span key={index} className="lb-bone lb-bone-card" />
                ))}
              </div>
              <p className="sr-only" role="status">
                Loading the profile.
              </p>
            </>
          )}
          {loaded.kind === "problem" && <ProblemPanel problem={loaded.problem} compact onRetry={() => setAttempt((count) => count + 1)} />}
          {loaded.kind === "missing" && (
            <p className="lb-state-text lb-profile-missing" role="status">
              This player is not on the leaderboard any more.
            </p>
          )}
          {shown && <ProfileStats profile={shown} tone={tone} />}
        </div>
      </div>
    </div>
  );
}

/** The stats cards and the table by level (the profile sheet and the Profile screen). */
// The player's own reports for abandoned games, and the suspension when
// there is one (D85). Only in their own profile: the server sends it only
// with their token.
function ReportsStat({ conduct: server }: { conduct: NonNullable<ProfileResponse["conduct"]> }) {
  // The server's count with this device's (reports it has not taken yet).
  const conduct = useShownConduct(server);
  const until = conduct.suspendedUntil === null ? null : Date.parse(conduct.suspendedUntil);
  return (
    <div className="lb-stat lb-stat-wide lb-stat-reports">
      <span className="lb-stat-icon" aria-hidden="true">
        <FlagIcon />
      </span>
      <dt>Reports</dt>
      <dd>
        <span className="lb-stat-number">{conduct.totalReports}</span>
        {until !== null && !Number.isNaN(until) && <span className="lb-stat-words lb-stat-suspended">Suspended until {longDate(until)}</span>}
      </dd>
    </div>
  );
}

export function ProfileStats({ profile, tone = "gold" }: { profile: ProfileResponse; tone?: Tone }) {
  const cards = [
    { key: "games", label: "Games played", value: String(profile.gamesPlayed), icon: <LbGamepad tone={tone} /> },
    { key: "wins", label: "Wins", value: String(profile.wins), icon: <LbTrophy tone="gold" /> },
    { key: "losses", label: "Losses", value: String(profile.losses), icon: <LbSwords tone={tone} /> },
    { key: "draws", label: "Draws", value: String(profile.draws ?? 0), icon: <LbGamepad tone={tone} /> },
    { key: "rate", label: "Win rate", value: profile.winRate === null ? "None yet" : percent(profile.winRate), icon: <LbTarget tone={tone} /> },
  ];
  return (
    <>
      <dl className="lb-stats">
        {cards.map((card) => (
          <div key={card.key} className={`lb-stat lb-stat-${card.key}${card.value === "None yet" ? " lb-stat-none" : ""}`}>
            <span className="lb-stat-icon" aria-hidden="true">
              {card.icon}
            </span>
            <dt>{card.label}</dt>
            <dd className="lb-stat-number">{card.value}</dd>
          </div>
        ))}
        <div className="lb-stat lb-stat-wide lb-stat-best">
          <span className="lb-stat-icon lb-stat-icon-laurels" aria-hidden="true">
            <LbLaurel tone={tone} />
            <LbStar tone={tone === "silver" ? "silver" : "gold"} />
            <LbLaurel tone={tone} flip />
          </span>
          <dt>Best win</dt>
          <dd>
            {profile.bestWin ? (
              <>
                <span className="lb-stat-number">{profile.bestWin.moves}</span> moves on {AI_LEVELS[profile.bestWin.level].name}
              </>
            ) : (
              <span className="lb-stat-words">No wins yet</span>
            )}
          </dd>
        </div>
        <div className="lb-stat lb-stat-wide lb-stat-week">
          <span className="lb-stat-icon" aria-hidden="true">
            <LbBars tone={tone} rank />
          </span>
          <dt>This week on Strongest</dt>
          <dd>
            {profile.weeklyStrongestRank !== null ? (
              <>
                Rank <span className="lb-stat-number">{profile.weeklyStrongestRank}</span>
              </>
            ) : (
              <span className="lb-stat-words">Not ranked yet</span>
            )}
          </dd>
          <LbMountains />
        </div>
        {profile.conduct && <ReportsStat conduct={profile.conduct} />}
      </dl>

      <div className="lb-levels-title" aria-hidden="true">
        <span className="lb-levels-line" />
        <LbLaurel tone={tone} />
        <span>Results by level</span>
        <LbLaurel tone={tone} flip />
        <span className="lb-levels-line" />
      </div>
      <table className="lb-levels">
        <caption className="sr-only">Results by level</caption>
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Wins</th>
            <th scope="col">Losses</th>
            <th scope="col">Draws</th>
            <th scope="col">Resigned</th>
          </tr>
        </thead>
        <tbody>
          {[...profile.byLevel].reverse().map((record) => (
            <tr key={record.level}>
              <th scope="row">
                <LevelCrown level={record.level} />
                {AI_LEVELS[record.level].name}
              </th>
              <td>{record.wins}</td>
              <td>{record.losses}</td>
              <td>{record.draws ?? 0}</td>
              <td>{record.resigned ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
