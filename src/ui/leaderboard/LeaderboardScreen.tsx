// The leaderboard (D57, redesigned in D62 after mockup/Leader_board.png):
// open to everyone, from the home screen and the game's Menu, as a full
// screen layer over whatever is behind it (a game stays as it was).
//
// Top: a close button and the title. Then the level tabs (Strongest first),
// the three periods and the reset line. Then the podium: the top ranked
// player card in the middle under its crown, the second ranked player card
// on the left and the third ranked player card on the right, each with the
// same medal (D63). Then ranks 4 and on as rows; the player's own row is
// highlighted (and shown above the list when it is not on the first page).
// Every state has its own calm panel: loading, empty, offline, a server
// problem, too many requests.
//
// Scrolling (D63): on screens tall enough, the top of the screen stays put
// and only the list scrolls, so it gets all the height that is left. On
// shorter screens the list would be a sliver, so the whole layer scrolls as
// one page instead.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { AI_LEVELS } from "../../ai/difficulty";
import type { AiLevel } from "../../ai/difficulty";
import { PERIODS, resetsInText } from "../../leaderboard/periods";
import type { Period } from "../../leaderboard/periods";
import { LEADERBOARD_LEVELS, PAGE_SIZE } from "../../leaderboard/protocol";
import type { LeaderboardRow } from "../../leaderboard/protocol";
import { Avatar } from "./Avatar";
import { Flag, countryName } from "./Flag";
import {
  ChevronDownIcon,
  CloseIcon,
  LbBars,
  LbCalendar,
  LbCrown,
  LbGradients,
  LbInfinity,
  LbLaurel,
  LbStar,
  LbSwords,
  LbTrophy,
} from "./lbIcons";
import type { Tone } from "./lbIcons";
import { InfoButton, InfoDialog, RankingRules } from "./InfoDialog";
import { ProfileSheet, TIERS } from "./ProfileSheet";
import { useLeaderboardProfile } from "./profile";
import { ProblemPanel, problemText } from "./Problem";
import { useLeaderboardPage } from "./useLeaderboardPage";

const PERIOD_NAMES: Record<Period, string> = { week: "This week", month: "This month", all: "All time" };
const EMPTY: Record<Period, string> = {
  week: "No wins yet this week. Be the first.",
  month: "No wins yet this month. Be the first.",
  all: "No wins yet. Be the first.",
};
const TAB_ICONS: Record<AiLevel, ReactNode> = {
  4: <LbCrown />,
  3: <LbSwords tone="cream" />,
  2: <LbBars />,
  1: <LbStar />,
};

const winsWord = (wins: number) => (wins === 1 ? "win" : "wins");
const rowLabel = (row: LeaderboardRow, mine: boolean) =>
  `Rank ${row.rank}, ${row.username}${mine ? ", you" : ""}, ${countryName(row.country)}, ${row.wins} ${winsWord(row.wins)}. Open profile.`;

// Below this height the rows box would show fewer than about three rows.
const MIN_ROWS_HEIGHT = 170;

/**
 * Whether the screen is too short to keep the top fixed with a rows box
 * of its own (D64a). Measured, not guessed from the window: the room left
 * for the rows is the same in both layouts (the top above them does not
 * change), so the choice never flips back and forth.
 */
function useStacked(board: RefObject<HTMLDivElement | null>, contentKey: unknown): boolean {
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const element = board.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const rows = element.querySelector<HTMLElement>(".lb-scroll, .lb-skeleton, .lb-state");
      if (!rows) return;
      const frame = element.getBoundingClientRect();
      const bottom = frame.bottom - parseFloat(getComputedStyle(element).paddingBottom);
      const room = bottom - (rows.getBoundingClientRect().top + element.scrollTop);
      setStacked(room < MIN_ROWS_HEIGHT);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [board, contentKey]);
  return stacked;
}

// The time left until the week or month resets, kept fresh once a minute.
function useResetsIn(resetsAt: string | null): string | null {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return resetsAt ? resetsInText(new Date(resetsAt), now) : null;
}

interface LeaderboardScreenProps {
  onClose: () => void;
  /** The own row opens the Profile screen (where it can be edited). */
  onOwnProfile?: (() => void) | undefined;
}

export function LeaderboardScreen({ onClose, onOwnProfile }: LeaderboardScreenProps) {
  const [level, setLevel] = useState<AiLevel>(4);
  const [period, setPeriod] = useState<Period>("week");
  const [openProfile, setOpenProfile] = useState<{ username: string; rank: number } | null>(null);
  // The ranking rules, behind the (i) beside the reset line (D64a).
  const [rulesOpen, setRulesOpen] = useState(false);
  const { state, retry, loadMore } = useLeaderboardPage(level, period);
  const { profile } = useLeaderboardProfile();
  const ids = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const resetsIn = useResetsIn(state.kind === "ready" ? state.resetsAt : null);

  // Focus starts on the close button; it returns where it was when the screen closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  const isMine = (row: LeaderboardRow) => profile !== null && row.username.toLowerCase() === profile.username.toLowerCase();
  const open = (row: LeaderboardRow) => {
    if (isMine(row) && onOwnProfile) onOwnProfile();
    else setOpenProfile({ username: row.username, rank: row.rank });
  };

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
  // "Your place" shows when the own row is not on the first page, and stays
  // after Load more brings it in, so nothing above the list ever disappears
  // (no jump while scrolling).
  const meAbove = me !== null && me.rank > PAGE_SIZE;
  const levelName = AI_LEVELS[level].name;
  const stacked = useStacked(boardRef, `${state.kind} ${level} ${period} ${me !== null}`);
  const panelId = `${ids}-panel`;

  return (
    <div className="lb-backdrop">
      <LbGradients />
      <div
        ref={boardRef}
        className={`lb-screen lb-board${stacked ? " lb-board-stacked" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && openProfile === null && !rulesOpen) onClose();
        }}
      >
        <header className="lb-head">
          <span className="lb-head-spacer" aria-hidden="true" />
          <h2 id={`${ids}-title`} className="lb-title">
            <span className="lb-title-laurel" aria-hidden="true">
              <LbLaurel />
            </span>
            <span className="lb-title-trophy" aria-hidden="true">
              <LbTrophy />
            </span>
            <span className="lb-title-text">Leaderboard</span>
            <span className="lb-title-laurel" aria-hidden="true">
              <LbLaurel flip />
            </span>
          </h2>
          <button ref={closeRef} type="button" className="lb-close" aria-label="Close the leaderboard" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

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
              <span className="lb-tab-icon" aria-hidden="true">
                {TAB_ICONS[tabLevel]}
              </span>
              <span className="lb-tab-name">{AI_LEVELS[tabLevel].name}</span>
            </button>
          ))}
        </div>

        <fieldset className="lb-periods">
          <legend className="sr-only">Period</legend>
          {PERIODS.map((option) => (
            <label key={option} className="lb-period">
              <input type="radio" name={`${ids}-period`} value={option} checked={period === option} onChange={() => setPeriod(option)} />
              <span className="lb-period-face">
                <span className="lb-period-icon" aria-hidden="true">
                  {option === "all" ? <LbInfinity /> : <LbCalendar tone="cream" />}
                </span>
                {PERIOD_NAMES[option]}
              </span>
            </label>
          ))}
        </fieldset>
        {/* Always one line tall, so switching never moves the layout. */}
        <p className="lb-resets">
          <span className="lb-resets-laurel" aria-hidden="true">
            <LbLaurel />
          </span>
          <span>{period === "all" ? "Every win since the leaderboard opened" : (resetsIn ?? " ")}</span>
          <span className="lb-resets-laurel" aria-hidden="true">
            <LbLaurel flip />
          </span>
          <InfoButton label="How the ranking works" onClick={() => setRulesOpen(true)} />
        </p>

        <div id={panelId} role="tabpanel" aria-labelledby={`${ids}-tab-${level}`} aria-busy={state.kind === "loading"} className="lb-panel">
          {state.kind === "loading" && <Skeleton />}

          {/* Offline, a server problem or too many requests: each its own words (D59). */}
          {state.kind === "problem" && <ProblemPanel problem={state.problem} onRetry={retry} />}

          {state.kind === "ready" && state.total === 0 && (
            <div className="lb-state" role="status">
              <span className="lb-state-icon" aria-hidden="true">
                <LbTrophy />
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
              <div className="lb-podium-stage">
                <ol className="lb-podium" key={`${level}-${period}`}>
                  {podium[0] && <TopRankedPlayerCard row={podium[0]} mine={isMine(podium[0])} onOpen={() => open(podium[0]!)} />}
                  {podium[1] ? <SecondRankedPlayerCard row={podium[1]} mine={isMine(podium[1])} onOpen={() => open(podium[1]!)} /> : <OpenPlace rank={2} />}
                  {podium[2] ? <ThirdRankedPlayerCard row={podium[2]} mine={isMine(podium[2])} onOpen={() => open(podium[2]!)} /> : <OpenPlace rank={3} />}
                </ol>
                <span className="lb-stage" aria-hidden="true" />
              </div>

              {me && meAbove && (
                <div className="lb-own-place">
                  <p className="lb-own-place-label">Your place</p>
                  <Row row={me} mine onOpen={() => open(me)} />
                </div>
              )}

              {list.length > 0 && (
                <div className="lb-list-head" aria-hidden="true">
                  <span>#</span>
                  <span>Player</span>
                  <span>Wins</span>
                </div>
              )}

              {(list.length > 0 || rows.length < state.total) && (
                <div className="lb-scroll">
                  {list.length > 0 && (
                    <ol className="lb-list" aria-label={`Players ranked 4 and below on ${levelName}`}>
                      {list.map((row) => (
                        <li key={row.rank}>
                          <Row row={row} mine={isMine(row)} onOpen={() => open(row)} />
                        </li>
                      ))}
                    </ol>
                  )}

                  {rows.length < state.total && (
                    <div className="lb-more">
                      {typeof state.more === "object" && (
                        <p className="lb-more-error" role="status">
                          {problemText(state.more)}
                        </p>
                      )}
                      <button
                        type="button"
                        className="lb-more-button"
                        disabled={state.more === "loading"}
                        aria-busy={state.more === "loading"}
                        onClick={() => void loadMore()}
                      >
                        {state.more === "loading" ? "Loading…" : typeof state.more === "object" ? "Try again" : "Load more"}
                        <ChevronDownIcon />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="lb-scenery" aria-hidden="true" />
      </div>

      {rulesOpen && (
        <InfoDialog title="How the ranking works" onClose={() => setRulesOpen(false)}>
          <RankingRules />
        </InfoDialog>
      )}
      {openProfile !== null && <ProfileSheet username={openProfile.username} rank={openProfile.rank} onClose={() => setOpenProfile(null)} />}
    </div>
  );
}

interface CardProps {
  row: LeaderboardRow;
  mine: boolean;
  onOpen: () => void;
}

// One podium card: medal, avatar with its flag, name, the wins. The medal
// says the rank, so the tier's words are only spoken, not shown (D63).
function PodiumCard({ row, mine, onOpen, tier }: CardProps & { tier: 1 | 2 | 3 }) {
  const { label, tone, className } = TIERS[tier]; // the label is spoken only
  return (
    <li className={`lb-place lb-place-${tier} ${className}${mine ? " lb-mine" : ""}`}>
      {tier === 1 && (
        <span className="lb-place-crown" aria-hidden="true">
          <LbCrown />
        </span>
      )}
      <button type="button" className="lb-place-button" aria-label={`${label}. ${rowLabel(row, mine)}`} onClick={onOpen}>
        <Medal rank={tier} tone={tone} />
        <Picture row={row} size={tier === 1 ? 66 : 54} className={`lb-place-avatar lb-ring-${tone}`} />
        <span className="lb-place-name lb-name" aria-hidden="true">
          {row.username}
        </span>
        <span className="lb-place-wins" aria-hidden="true">
          <span className="lb-count">{row.wins}</span>
          <span className="lb-wins-label">{winsWord(row.wins)}</span>
        </span>
      </button>
    </li>
  );
}

/** The middle of the podium: rank 1, under the crown. */
export function TopRankedPlayerCard(props: CardProps) {
  return <PodiumCard {...props} tier={1} />;
}

/** Left of the podium: rank 2, in silver. */
export function SecondRankedPlayerCard(props: CardProps) {
  return <PodiumCard {...props} tier={2} />;
}

/** Right of the podium: rank 3, in bronze. */
export function ThirdRankedPlayerCard(props: CardProps) {
  return <PodiumCard {...props} tier={3} />;
}

// Fewer than three players: the free places stay, so the podium keeps its shape.
function OpenPlace({ rank }: { rank: 2 | 3 }) {
  const { tone, className } = TIERS[rank];
  return (
    <li className={`lb-place lb-place-${rank} ${className} lb-place-open`} aria-hidden="true">
      <span className="lb-place-button">
        <Medal rank={rank} tone={tone} />
        <span className="lb-open-text">Open</span>
      </span>
    </li>
  );
}

// The avatar with the flag on its lower edge: one size and one place for
// the flag on the podium and in the rows (D63). No country, no flag.
function Picture({ row, size, className }: { row: LeaderboardRow; size: number; className: string }) {
  return (
    <span className={`lb-pic ${className}`} aria-hidden="true">
      <Avatar id={row.avatar} size={size} />
      {row.country !== null && (
        <span className="lb-pic-flag">
          <Flag code={row.country} decorative />
        </span>
      )}
    </span>
  );
}

function Medal({ rank, tone }: { rank: number; tone: Tone }) {
  return (
    <span className={`lb-medal lb-medal-${tone}`} aria-hidden="true">
      <span className="lb-num">{rank}</span>
    </span>
  );
}

export function Row({ row, mine, onOpen }: { row: LeaderboardRow; mine: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`lb-row${mine ? " lb-mine" : ""}`} aria-label={rowLabel(row, mine)} onClick={onOpen}>
      <span className="lb-rank lb-num" aria-hidden="true">
        {row.rank}
      </span>
      <span className="lb-row-who" aria-hidden="true">
        <Picture row={row} size={32} className="lb-row-pic" />
        <span className="lb-name">{row.username}</span>
        {mine && <span className="lb-you">You</span>}
      </span>
      <span className="lb-row-wins" aria-hidden="true">
        {row.wins}
      </span>
    </button>
  );
}

// Placeholders in the shapes of the podium and the first rows.
function Skeleton() {
  return (
    <>
      <div className="lb-skeleton" aria-hidden="true">
        <div className="lb-podium lb-podium-skeleton">
          {[1, 2, 3].map((rank) => (
            <div key={rank} className={`lb-place lb-place-${rank} lb-place-skeleton`}>
              <span className="lb-place-button">
                <span className="lb-bone lb-bone-avatar" />
                <span className="lb-bone lb-bone-name" />
                <span className="lb-bone lb-bone-number" />
              </span>
            </div>
          ))}
        </div>
        {Array.from({ length: 5 }, (_, index) => (
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
