// Putting a qualifying win on the leaderboard (D57). Shown in the result
// panel after the win, and once more from the Menu or Settings if it was
// skipped. A first win asks for a username and a flag (the claim), with the
// rules checked while typing; later wins need one tap. Every message is calm
// and free of dashes.
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { AI_LEVELS } from "../../ai/difficulty";
import type { CountryChoice } from "../../leaderboard/protocol";
import { USERNAME_MAX, USERNAME_MESSAGES } from "../../leaderboard/username";
import { leaderboardApi } from "./api";
import type { ApiResult } from "./api";
import { CountrySelect, Flag } from "./Flag";
import { leaderboardStore, useLeaderboardProfile } from "./profile";
import type { PendingWin } from "./profile";
import { useUsernameCheck } from "./useUsernameCheck";

export const OFFLINE_TEXT = "You are offline. The leaderboard is not available right now.";

type Outcome =
  | { kind: "editing" }
  | { kind: "saving" }
  | { kind: "done"; rank: number | null }
  | { kind: "skipped" }
  | { kind: "error"; text: string; retry: boolean };

interface SubmitWinProps {
  win: PendingWin;
  /** "result": inside the result panel. "sheet": its own sheet from the Menu or Settings. */
  placement: "result" | "sheet";
  onTerms: () => void;
  onViewLeaderboard?: (() => void) | undefined;
  /** The sheet closes after Skip or when done. */
  onClose?: (() => void) | undefined;
}

// The words for a refusal from the server.
function refusal(result: Exclude<ApiResult<unknown>, { kind: "ok" }>): { text: string; retry: boolean; forget: boolean } {
  if (result.kind === "offline") return { text: OFFLINE_TEXT, retry: true, forget: false };
  if (result.status === 429) return { text: "Too many tries. Please wait a few minutes and try again.", retry: true, forget: false };
  if (result.code === "duplicate") return { text: "This win is already on the leaderboard.", retry: false, forget: true };
  if (result.status === 422) return { text: "This game could not be checked, so it cannot be added.", retry: false, forget: true };
  if (result.status === 401) return { text: "Your profile was not found on the server. Please choose a username again.", retry: false, forget: false };
  return { text: "Something went wrong. Please try again.", retry: true, forget: false };
}

export function SubmitWin({ win, placement, onTerms, onViewLeaderboard, onClose }: SubmitWinProps) {
  const { profile } = useLeaderboardProfile();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "editing" });
  const [name, setName] = useState("");
  const [country, setCountry] = useState<CountryChoice>("auto");
  const [takenName, setTakenName] = useState<string | null>(null);
  const check = useUsernameCheck(name);
  const ids = useId();
  const level = AI_LEVELS[win.level].name;

  const submit = async () => {
    setOutcome({ kind: "saving" });
    const result = await leaderboardApi.submitWin(win.gameId, win.level, win.moves);
    if (result.kind === "ok") {
      leaderboardStore.setPending(null);
      setOutcome({ kind: "done", rank: result.value.weekRank });
      return;
    }
    const { text, retry, forget } = refusal(result);
    if (forget) leaderboardStore.setPending(null);
    setOutcome({ kind: "error", text, retry });
  };

  const claimThenSubmit = async () => {
    setOutcome({ kind: "saving" });
    const claimed = await leaderboardApi.claimUsername(name, country);
    if (claimed.kind === "ok") return submit();
    if (claimed.kind === "failed" && claimed.code === "taken") {
      setTakenName(name);
      setOutcome({ kind: "editing" });
      return;
    }
    if (claimed.kind === "failed" && claimed.code === "username") {
      setOutcome({ kind: "error", text: "This username is not allowed. Please choose another.", retry: false });
      return;
    }
    const { text, retry } = refusal(claimed);
    setOutcome({ kind: "error", text, retry });
  };

  const skip = () => {
    // From the Menu or Settings this was the last chance: forget the win.
    if (placement === "sheet") {
      leaderboardStore.setPending(null);
      onClose?.();
    } else setOutcome({ kind: "skipped" });
  };

  const titleId = `${ids}-title`;
  const section = (body: ReactNode) => (
    <section className={`lb-submit lb-submit-${placement}`} aria-labelledby={titleId}>
      {body}
    </section>
  );

  if (outcome.kind === "done") {
    return section(
      <>
        <h3 id={titleId} className="lb-submit-title">
          Added to the leaderboard
        </h3>
        <p className="lb-submit-text" role="status">
          {outcome.rank !== null ? `You are number ${outcome.rank} this week on ${level}.` : `Your win on ${level} counts.`}
        </p>
        <div className="lb-submit-actions">
          {placement === "sheet" && (
            <button type="button" className="button" onClick={onClose}>
              Close
            </button>
          )}
          {onViewLeaderboard && (
            <button type="button" className="button button-primary" onClick={onViewLeaderboard}>
              View leaderboard
            </button>
          )}
        </div>
      </>,
    );
  }

  if (outcome.kind === "skipped") {
    return section(
      <p id={titleId} className="lb-submit-text lb-submit-skipped" role="status">
        Skipped. You can still add this win once from the Menu or Settings.
      </p>,
    );
  }

  const saving = outcome.kind === "saving";
  const error = outcome.kind === "error" ? outcome : null;
  const errorLine = error && (
    <p className="lb-submit-error" role="alert">
      {error.text}
    </p>
  );

  // A device with a profile: one tap.
  if (profile) {
    return section(
      <>
        <h3 id={titleId} className="lb-submit-title">
          Add this win to the leaderboard?
        </h3>
        <p className="lb-submit-as">
          <Flag code={profile.country} />
          <span className="lb-name">{profile.username}</span>
          <span className="lb-submit-level">{level}</span>
        </p>
        {errorLine}
        <div className="lb-submit-actions">
          <button type="button" className="button" disabled={saving} onClick={skip}>
            Skip
          </button>
          {(!error || error.retry) && (
            <button type="button" className="button button-primary" disabled={saving} aria-busy={saving} onClick={submit}>
              {saving ? "Adding…" : error ? "Try again" : "Add win"}
            </button>
          )}
        </div>
      </>,
    );
  }

  // A first win: choose a username and a flag.
  const taken = takenName !== null && takenName === name;
  const availability = taken ? "taken" : check.availability;
  const shownProblems = name.length > 0 ? check.problems : [];
  const canSave = name.length > 0 && check.problems.length === 0 && availability !== "taken" && !saving;
  const status: Record<typeof availability, string> = {
    idle: "",
    checking: "Checking…",
    available: "Available",
    taken: "Taken. Please choose another.",
    offline: "Could not check right now. You can still try Save.",
    limited: "Checking is paused for a moment.",
  };
  const fieldId = `${ids}-name`;
  const helpId = `${ids}-help`;
  return section(
    <>
      <h3 id={titleId} className="lb-submit-title">
        Put this win on the leaderboard
      </h3>
      <p className="lb-submit-text">Choose a username. It is shown publicly with your flag, so please do not use your real name.</p>
      <form
        className="lb-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) void claimThenSubmit();
        }}
      >
        <label htmlFor={fieldId} className="lb-field-label">
          Username
        </label>
        <input
          id={fieldId}
          className={`lb-input${shownProblems.length > 0 || availability === "taken" ? " lb-input-invalid" : ""}`}
          value={name}
          maxLength={USERNAME_MAX + 8}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={shownProblems.length > 0 || availability === "taken"}
          aria-describedby={helpId}
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
        />
        <div id={helpId} className="lb-field-help">
          {shownProblems.length > 0 ? (
            <ul className="lb-rules">
              {shownProblems.map((rule) => (
                <li key={rule}>{USERNAME_MESSAGES[rule]}</li>
              ))}
            </ul>
          ) : (
            <p className="lb-hint">3 to 16 letters, numbers or underscores, starting with a letter.</p>
          )}
          <p className={`lb-availability lb-availability-${availability}`} aria-live="polite">
            {status[availability]}
          </p>
        </div>
        <CountrySelect id={`${ids}-flag`} value={country} shown={country === "auto" ? null : country} allowAuto disabled={saving} onChange={setCountry} />
        <p className="lb-note">Your profile is kept in this browser. Clearing your browser data loses it.</p>
        <button type="button" className="link-button lb-terms" onClick={onTerms}>
          Read the Terms and notices
        </button>
        {errorLine}
        <div className="lb-submit-actions">
          <button type="button" className="button" disabled={saving} onClick={skip}>
            Skip
          </button>
          <button type="submit" className="button button-primary" disabled={!canSave} aria-busy={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </>,
  );
}

/** The form on its own sheet: the last skipped win, from the Menu or Settings. */
export function SubmitWinDialog({ win, onClose, onTerms, onViewLeaderboard }: Omit<SubmitWinProps, "placement" | "onClose"> & { onClose: () => void }) {
  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        className="dialog lb-submit-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add your last win to the leaderboard"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <SubmitWin win={win} placement="sheet" onTerms={onTerms} onViewLeaderboard={onViewLeaderboard} onClose={onClose} />
      </div>
    </div>
  );
}
