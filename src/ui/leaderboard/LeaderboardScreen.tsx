// The leaderboard (D57): open to everyone, from the home screen and the
// game's Menu, as a full screen layer over whatever is behind it (a game
// stays as it was). Tabs for the four levels (Strongest first), a segmented
// control for the period, a podium for the top three with the champion
// first among equals, then a list from 4 on. Every state has its own calm
// panel: loading rows, empty, offline. Rows open the player's profile.
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AI_LEVELS } from "../../ai/difficulty";
import type { AiLevel } from "../../ai/difficulty";
import { PERIODS, resetsInText } from "../../leaderboard/periods";
import type { Period } from "../../leaderboard/periods";
import { LEADERBOARD_LEVELS } from "../../leaderboard/protocol";
import type { LeaderboardRow } from "../../leaderboard/protocol";
import { BackIcon, CrownIcon, LaurelIcon, TrophyIcon } from "../icons";
import { Flag, countryName } from "./Flag";
import { ProfileSheet } from "./ProfileSheet";
import { useLeaderboardProfile } from "./profile";
import { OFFLINE_TEXT } from "./SubmitWin";
import { useLeaderboardPage } from "./useLeaderboardPage";

const PERIOD_NAMES: Record<Period, string> = { week: "This week", month: "This month", all: "All time" };
const CHAMPION: Record<Period, string> = { week: "Champion this week", month: "Champion this month", all: "Champion of all time" };
const EMPTY: Record<Period, string> = {
  week: "No wins yet this week. Be the first.",
  month: "No wins yet this month. Be the first.",
  all: "No wins yet. Be the first.",
};

const winsWord = (wins: number) => (wins === 1 ? "win" : "wins");
const rowLabel = (row: LeaderboardRow, mine: boolean) =>
  `Rank ${row.rank}, ${row.username}${mine ? ", you" : ""}, ${countryName(row.country)}, ${row.wins} ${winsWord(row.wins)}. Open profile.`;

// The time left until the week or month resets, kept fresh once a minute.
function useResetsIn(resetsAt: string | null): string | null {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return resetsAt ? resetsInText(new Date(resetsAt), now) : null;
}

export function LeaderboardScreen({ onClose, onTerms }: { onClose: () => void; onTerms?: () => void }) {
  const [level, setLevel] = useState<AiLevel>(4);
  const [period, setPeriod] = useState<Period>("week");
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const { state, retry, loadMore } = useLeaderboardPage(level, period);
  const { profile } = useLeaderboardProfile();
  const ids = useId();
  const backRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const resetsIn = useResetsIn(state.kind === "ready" ? state.resetsAt : null);

  // Focus starts on Back; it returns where it was when the screen closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    backRef.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  const isMine = (row: LeaderboardRow) => profile !== null && row.username.toLowerCase() === profile.username.toLowerCase();

  // Arrow keys, Home and End move between the level tabs (and choose them).
  const onTabKey = (event: KeyboardEvent, index: number) => {
    const last = LEADERBOARD_LEVELS.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    setLevel(LEADERBOARD_LEVELS[next]!);
    tabRefs.current[next]?.focus();
  };

  const rows = state.kind === "ready" ? state.rows : [];
  const podium = rows.slice(0, 3);
  const list = rows.slice(3);
  const me = state.kind === "ready" ? state.me : null;
  const meShown = me !== null && rows.some((row) => row.rank === me.rank);
  const levelName = AI_LEVELS[level].name;
  const panelId = `${ids}-panel`;

  return (
    <div className="lb-backdrop">
      <div
        className="lb-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && openProfile === null) onClose();
        }}
      >
        <header className="lb-head">
          <button ref={backRef} type="button" className="lb-icon-button" aria-label="Close the leaderboard" onClick={onClose}>
            <BackIcon />
          </button>
          <h2 id={`${ids}-title`} className="lb-title">
            <TrophyIcon />
            Leaderboard
          </h2>
          <span className="lb-head-spacer" aria-hidden="true" />
        </header>

        <div className="lb-controls">
          <div className="lb-tabs" role="tablist" aria-label="Level">
            {LEADERBOARD_LEVELS.map((tabLevel, index) => (
              <button
                key={tabLevel}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`${ids}-tab-${tabLevel}`}
                aria-selected={tabLevel === level}
                aria-controls={panelId}
                tabIndex={tabLevel === level ? 0 : -1}
                className="lb-tab"
                onClick={() => setLevel(tabLevel)}
                onKeyDown={(event) => onTabKey(event, index)}
              >
                {AI_LEVELS[tabLevel].name}
              </button>
            ))}
          </div>

          <fieldset className="lb-periods">
            <legend className="sr-only">Period</legend>
            {PERIODS.map((option) => (
              <label key={option} className="lb-period">
                <input type="radio" name={`${ids}-period`} value={option} checked={period === option} onChange={() => setPeriod(option)} />
                <span>{PERIOD_NAMES[option]}</span>
              </label>
            ))}
          </fieldset>
          {/* Always one line tall, so switching never moves the layout. */}
          <p className="lb-resets">{period === "all" ? "Every win since the leaderboard opened" : (resetsIn ?? " ")}</p>
        </div>

        <div id={panelId} role="tabpanel" aria-labelledby={`${ids}-tab-${level}`} aria-busy={state.kind === "loading"} className="lb-panel">
          {state.kind === "loading" && <Skeleton />}

          {state.kind === "offline" && (
            <div className="lb-state" role="status">
              <span className="lb-state-icon" aria-hidden="true">
                <OfflineIcon />
              </span>
              <p className="lb-state-text">{OFFLINE_TEXT}</p>
              <button type="button" className="button button-primary" onClick={retry}>
                Try again
              </button>
            </div>
          )}

          {state.kind === "ready" && state.total === 0 && (
            <div className="lb-state" role="status">
              <span className="lb-state-icon" aria-hidden="true">
                <TrophyIcon />
              </span>
              <p className="lb-state-text">{EMPTY[period]}</p>
              <p className="lb-state-sub">Win a game against the AI on {levelName} to take the top spot.</p>
            </div>
          )}

          {state.kind === "ready" && state.total > 0 && (
            <>
              <h3 className="sr-only">
                Top three on {levelName}, {PERIOD_NAMES[period].toLowerCase()}
              </h3>
              <ol className="lb-podium" key={`${level}-${period}`}>
                {podium.map((row) => (
                  <PodiumPlace key={row.rank} row={row} champion={CHAMPION[period]} mine={isMine(row)} onOpen={() => setOpenProfile(row.username)} />
                ))}
                {/* Fewer than three players: the free places stay visible, so the podium keeps its shape. */}
                {[2, 3].filter((rank) => rank > podium.length).map((rank) => (
                  <li key={`open-${rank}`} className={`lb-place lb-place-${rank} lb-place-open`} aria-hidden="true">
                    <span className="lb-place-button">
                      <span className="lb-medal">{rank}</span>
                      <span className="lb-open-text">Open</span>
                    </span>
                  </li>
                ))}
              </ol>

              {list.length > 0 && (
                <>
                  <div className="lb-list-head" aria-hidden="true">
                    <span>Rank</span>
                    <span>Player</span>
                    <span>Wins</span>
                  </div>
                  <ol className="lb-list" aria-label={`Players ranked 4 and below on ${levelName}`}>
                    {list.map((row) => (
                      <li key={row.rank}>
                        <Row row={row} mine={isMine(row)} onOpen={() => setOpenProfile(row.username)} />
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {rows.length < state.total && (
                <div className="lb-more">
                  {state.more === "offline" && <p className="lb-more-error">{OFFLINE_TEXT}</p>}
                  <button type="button" className="button" disabled={state.more === "loading"} aria-busy={state.more === "loading"} onClick={() => void loadMore()}>
                    {state.more === "loading" ? "Loading…" : state.more === "offline" ? "Try again" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* The player's own row, pinned when it is not on the loaded pages. */}
        {me && !meShown && (
          <div className="lb-pinned">
            <Row row={me} mine onOpen={() => setOpenProfile(me.username)} />
          </div>
        )}
      </div>

      {openProfile !== null && <ProfileSheet username={openProfile} onClose={() => setOpenProfile(null)} {...(onTerms ? { onTerms } : {})} />}
    </div>
  );
}

export function PodiumPlace({ row, champion, mine, onOpen }: { row: LeaderboardRow; champion: string; mine: boolean; onOpen: () => void }) {
  const first = row.rank === 1;
  return (
    <li className={`lb-place lb-place-${row.rank}${mine ? " lb-mine" : ""}`}>
      <button type="button" className="lb-place-button" aria-label={`${first ? `${champion}. ` : ""}${rowLabel(row, mine)}`} onClick={onOpen}>
        {first && (
          <span className="lb-champion-emblem" aria-hidden="true">
            <span className="lb-laurel lb-laurel-left">
              <LaurelIcon />
            </span>
            <span className="lb-crown">
              <CrownIcon />
            </span>
            <span className="lb-laurel lb-laurel-right">
              <LaurelIcon flip />
            </span>
          </span>
        )}
        <span className="lb-medal" aria-hidden="true">
          {row.rank}
        </span>
        <span className="lb-place-who" aria-hidden="true">
          <Flag code={row.country} decorative />
          <span className="lb-name">{row.username}</span>
        </span>
        {first && (
          <span className="lb-champion-label" aria-hidden="true">
            Champion
          </span>
        )}
        <span className="lb-place-wins" aria-hidden="true">
          <span className="lb-big-number">{row.wins}</span>
          <span className="lb-wins-label">{winsWord(row.wins)}</span>
        </span>
      </button>
    </li>
  );
}

export function Row({ row, mine, onOpen }: { row: LeaderboardRow; mine: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`lb-row${mine ? " lb-mine" : ""}`} aria-label={rowLabel(row, mine)} onClick={onOpen}>
      <span className="lb-rank" aria-hidden="true">
        {row.rank}
      </span>
      <span className="lb-row-who" aria-hidden="true">
        <Flag code={row.country} decorative />
        <span className="lb-name">{row.username}</span>
        {mine && <span className="lb-you">You</span>}
      </span>
      <span className="lb-row-wins" aria-hidden="true">
        {row.wins}
      </span>
    </button>
  );
}

// Grey placeholders in the shapes of the podium and the first rows.
function Skeleton() {
  return (
    <>
    <div className="lb-skeleton" aria-hidden="true">
      <div className="lb-podium lb-podium-skeleton">
        {[2, 1, 3].map((rank) => (
          <div key={rank} className={`lb-place lb-place-${rank} lb-place-skeleton`}>
            <span className="lb-bone lb-bone-medal" />
            <span className="lb-bone lb-bone-name" />
            <span className="lb-bone lb-bone-number" />
          </div>
        ))}
      </div>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="lb-row lb-row-skeleton">
          <span className="lb-bone lb-bone-rank" />
          <span className="lb-bone lb-bone-line" />
          <span className="lb-bone lb-bone-rank" />
        </div>
      ))}
    </div>
    <p className="sr-only" role="status">
      Loading the leaderboard.
    </p>
    </>
  );
}

// A cloud with a line through it.
function OfflineIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z" />
      <path d="M4 4l16 16" />
    </svg>
  );
}
