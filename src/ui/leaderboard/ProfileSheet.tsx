// A player's profile (D57), opened by tapping their row or podium place:
// username, flag, stats cards and wins by level. No avatars or photos. The
// player's own profile also lets them change or remove their flag.
import { useEffect, useId, useRef, useState } from "react";
import { AI_LEVELS } from "../../ai/difficulty";
import type { CountryChoice, ProfileResponse } from "../../leaderboard/protocol";
import { leaderboardApi } from "./api";
import { CountrySelect, Flag, countryName } from "./Flag";
import { useLeaderboardProfile } from "./profile";
import { OFFLINE_TEXT } from "./SubmitWin";

type Loaded = { kind: "loading" } | { kind: "offline" } | { kind: "missing" } | { kind: "ready"; profile: ProfileResponse };

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

export function ProfileSheet({ username, onClose, onTerms }: { username: string; onClose: () => void; onTerms?: () => void }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { profile: own } = useLeaderboardProfile();
  const mine = own !== null && own.username.toLowerCase() === username.toLowerCase();
  const ids = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

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
        else setLoaded(result.kind === "failed" && result.status === 404 ? { kind: "missing" } : { kind: "offline" });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [username, attempt]);

  const shown = loaded.kind === "ready" ? loaded.profile : null;
  const country = mine ? own.country : (shown?.country ?? null);

  return (
    <div className="result-backdrop lb-profile-backdrop" onClick={onClose}>
      <div
        className="dialog lb-profile"
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
        <div className="lb-profile-head">
          <span className="lb-profile-flag">
            <Flag code={country} decorative />
          </span>
          <div className="lb-profile-who">
            <h2 id={`${ids}-title`} className="lb-profile-name">
              {shown?.username ?? username}
            </h2>
            <p className="lb-profile-country">
              {countryName(country)}
              {mine && <span className="lb-you">You</span>}
            </p>
          </div>
          <button ref={closeRef} type="button" className="settings-close" aria-label="Close the profile" onClick={onClose}>
            ×
          </button>
        </div>

        {loaded.kind === "loading" && (
          <div className="lb-profile-skeleton" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} className="lb-bone lb-bone-card" />
            ))}
          </div>
        )}
        {loaded.kind === "loading" && (
          <p className="sr-only" role="status">
            Loading the profile.
          </p>
        )}

        {loaded.kind === "offline" && (
          <div className="lb-state lb-state-compact" role="status">
            <p className="lb-state-text">{OFFLINE_TEXT}</p>
            <button type="button" className="button button-primary" onClick={() => setAttempt((count) => count + 1)}>
              Try again
            </button>
          </div>
        )}

        {loaded.kind === "missing" && (
          <p className="lb-state-text lb-profile-missing" role="status">
            This player is not on the leaderboard any more.
          </p>
        )}

        {shown && <ProfileStats profile={shown} />}

        {mine && loaded.kind === "ready" && <OwnFlag current={own.country} />}
        {mine && onTerms && (
          <button type="button" className="link-button lb-terms" onClick={onTerms}>
            Read the Terms and notices
          </button>
        )}
      </div>
    </div>
  );
}

export function ProfileStats({ profile }: { profile: ProfileResponse }) {
  const cards: [string, string][] = [
    ["Games played", String(profile.gamesPlayed)],
    ["Wins", String(profile.wins)],
    ["Losses", String(profile.losses)],
    ["Win rate", profile.winRate === null ? "None yet" : percent(profile.winRate)],
  ];
  return (
    <>
      <dl className="lb-cards">
        {cards.map(([label, value]) => (
          <div key={label} className="lb-card">
            <dt>{label}</dt>
            <dd className="lb-card-number">{value}</dd>
          </div>
        ))}
        <div className="lb-card lb-card-wide">
          <dt>Best win</dt>
          <dd>
            {profile.bestWin ? (
              <>
                <span className="lb-card-number">{profile.bestWin.moves}</span> moves on {AI_LEVELS[profile.bestWin.level].name}
              </>
            ) : (
              "No wins yet"
            )}
          </dd>
        </div>
        <div className="lb-card lb-card-wide">
          <dt>This week on Strongest</dt>
          <dd>
            {profile.weeklyStrongestRank !== null ? (
              <>
                Rank <span className="lb-card-number">{profile.weeklyStrongestRank}</span>
              </>
            ) : (
              "Not ranked yet"
            )}
          </dd>
        </div>
      </dl>

      <table className="lb-levels">
        <caption>Wins and losses by level</caption>
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Wins</th>
            <th scope="col">Losses</th>
          </tr>
        </thead>
        <tbody>
          {[...profile.byLevel].reverse().map((record) => (
            <tr key={record.level}>
              <th scope="row">{AI_LEVELS[record.level].name}</th>
              <td>{record.wins}</td>
              <td>{record.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// The player's own flag: change it or choose No flag. Saved at once.
export function OwnFlag({ current }: { current: string | null }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const ids = useId();
  const change = async (choice: CountryChoice) => {
    setStatus("saving");
    const result = await leaderboardApi.updateCountry(choice);
    setStatus(result.kind === "ok" ? "saved" : "offline");
  };
  const words = { idle: "", saving: "Saving…", saved: "Saved.", offline: OFFLINE_TEXT };
  return (
    <div className="lb-own-flag">
      <CountrySelect id={`${ids}-flag`} value={current} shown={current} allowAuto={false} disabled={status === "saving"} onChange={(choice) => void change(choice)} />
      <p className="lb-hint" aria-live="polite">
        {words[status]}
      </p>
    </div>
  );
}
