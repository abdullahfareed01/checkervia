// The Profile screen (D61, D62): one screen to make a leaderboard profile
// and to change it later. Opened from the home screen's profile icon, the
// Menu, Settings, the own row on the leaderboard, and before the first game
// against the AI (the board is not shown until the profile is saved).
//
// Making a profile: username (the shared rules, checked while typing, then
// the live availability check), an avatar (a category is only a filter for
// the grid), a country or "Prefer not to show a flag" (nothing is chosen
// for the player), the public notice with its required "I understand", then
// Save. There is no Skip: Back leaves.
//
// The own profile (D64a) opens as a view: the avatar, flag and the stats in
// little room. A pencil on the avatar opens the edit page, with an (i) that
// shows the rules for the username, flag and avatar; Cancel or Save returns
// to the view.
//
// Like the Settings sheet, the screen is sized to what it shows and never
// scrolls: anything longer (the table by level, the reports, the username
// and the avatar grid) is a row that opens a page inside the screen, with
// Back in the header.
// The username can change once every 7 days (the screen says when the next
// change is allowed); the old name stays reserved for 30 days. The avatar
// and the flag can change any time. Saving, saved and the three problem
// messages (D59) are shown under Save.
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { NO_COUNTRY, RENAME_WAIT_DAYS, REPORT_LIMIT } from "../../leaderboard/protocol";
import type { ConductStatus, ProfileResponse } from "../../leaderboard/protocol";
import { AI_LEVELS } from "../../ai/difficulty";
import { USERNAME_MAX, USERNAME_MESSAGES } from "../../leaderboard/username";
import { leaderboardApi } from "./api";
import type { ApiResult } from "./api";
import { AVATAR_CATEGORIES, Avatar, avatarsIn, categoryOf } from "./Avatar";
import type { AvatarCategory } from "./Avatar";
import { CountryPicker } from "./CountryPicker";
import { Flag, countryName } from "./Flag";
import { CloseIcon, LbBars, LbCalendar, LbGradients, LbLaurel, LbStar, LevelCrown, PencilIcon, PersonIcon, PictureIcon, PinIcon } from "./lbIcons";
import { useLeaderboardProfile } from "./profile";
import type { Profile } from "./profile";
import { ProblemPanel, problemOf, problemText } from "./Problem";
import type { Problem } from "./Problem";
import { InfoButton, InfoDialog, ProfileRules } from "./InfoDialog";
import { conductStore, useShownConduct } from "../conduct";
import { longDate, reportsLeftText } from "../ConductDialogs";
import { BackIcon, ChevronIcon } from "../icons";
import { AccountSection, LoginEntry } from "./AccountSection";
import { useAccountsEnabled } from "./accountClient";
import { useUsernameCheck } from "./useUsernameCheck";
import type { UsernameCheck } from "./useUsernameCheck";

export const PUBLIC_NOTICE = "Your username, flag and wins are public on the leaderboard.";
export const BROWSER_NOTICE = "Your profile is kept in this browser. Clearing your browser data loses it.";

/** "a, b and c". */
const listText = (items: readonly string[]) => (items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; text: string };

/** "Saturday 21 November", the day a username may change again. */
export function renameDateText(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

// The words for a refused save. Offline, server problems and too many
// requests use the three shared messages (D59).
export function saveProblemText(result: Exclude<ApiResult<unknown>, { kind: "ok" }>): string {
  if (result.kind === "failed") {
    if (result.code === "taken") return "This username is taken. Please choose another.";
    if (result.code === "username") return "This username is not allowed. Please choose another.";
    if (result.code === "renameTooSoon" && result.nextRenameAt) return `You can change your username again on ${renameDateText(result.nextRenameAt)}.`;
    if (result.status === 401) return "Your profile was not found on the server.";
    if (result.status === 400) return "Something in the form was not accepted. Please check it and try again.";
  }
  return problemText(problemOf(result));
}

interface ProfileScreenProps {
  onClose: () => void;
  /** Before the first game: Save leads on to the board. */
  firstGame?: boolean;
  onSaved?: (() => void) | undefined;
  onTerms: () => void;
}


// The header: Back on a page inside the screen (or room for it), the title,
// anything extra (the rules (i) on the edit page), and Close.
type Head = (title: string, options?: { back?: () => void; backLabel?: string; extra?: ReactNode }) => ReactNode;

export function ProfileScreen({ onClose, firstGame = false, onSaved, onTerms }: ProfileScreenProps) {
  const { profile } = useLeaderboardProfile();
  // Chosen when the screen opens: a profile made here shows its saved state
  // first (the store changes before that), and only Done leads to editing.
  const [creatingChosen, setCreating] = useState(() => profile === null);
  const ids = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  const creating = creatingChosen || profile === null;
  const head: Head = (title, { back, backLabel, extra } = {}) => (
    <header className="lb-head pf-head">
      {back ? (
        <button type="button" className="pf-back" data-back="" aria-label={backLabel ?? "Back"} onClick={back}>
          <BackIcon />
        </button>
      ) : (
        <span className="lb-head-spacer pf-head-spacer" aria-hidden="true" />
      )}
      <h2 id={`${ids}-title`} className="lb-title pf-title">
        {!back && (
          <span className="pf-title-icon" aria-hidden="true">
            <PersonIcon />
          </span>
        )}
        <span className="lb-title-text">{title}</span>
      </h2>
      {extra}
      <button ref={closeRef} type="button" className="lb-close" aria-label={firstGame ? "Back to the home screen" : "Close your profile"} onClick={onClose}>
        <CloseIcon />
      </button>
    </header>
  );
  return (
    <div className="lb-backdrop pf-backdrop">
      <LbGradients />
      <div
        className="lb-screen pf-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) onClose();
        }}
      >
        {creating ? (
          <CreateProfile
            head={head}
            firstGame={firstGame}
            onDone={() => (firstGame ? onSaved?.() : setCreating(false))}
            onBack={onClose}
            onTerms={onTerms}
          />
        ) : (
          <EditProfile head={head} profile={profile} onTerms={onTerms} />
        )}
        <div className="lb-scenery" aria-hidden="true" />
      </div>
    </div>
  );
}

// ---------- Pages inside the screen (like the Settings sheet) ----------

/**
 * The page shown inside the screen, null for the first one. Back goes to
 * the page's parent (or the first page); the keyboard lands on Back when a
 * page opens, and on the row that opened it when coming back.
 */
function usePages<P extends string>(parent: Partial<Record<P, P>> = {}) {
  const [page, setPage] = useState<P | null>(null);
  const left = useRef<P | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const screen = document.querySelector(".pf-screen");
    if (screen) screen.scrollTop = 0;
    const target = left.current ? screen?.querySelector<HTMLElement>(`[data-opens="${left.current}"]`) : screen?.querySelector<HTMLElement>("[data-back]");
    (target ?? screen?.querySelector<HTMLElement>(".lb-close"))?.focus({ preventScroll: true });
  }, [page]);
  const open = (next: P) => {
    left.current = null;
    setPage(next);
  };
  const back = () => {
    if (page === null) return;
    left.current = page;
    setPage(parent[page] ?? null);
  };
  // Escape on a page steps back instead of closing the screen.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || page === null || event.defaultPrevented) return;
    event.preventDefault();
    back();
  };
  return { page, open, back, onKeyDown };
}

/** A row that opens a page: the label, what is chosen now, and an arrow. */
function Row({ opens, label, value, invalid = false, disabled = false, onOpen }: { opens: string; label: string; value: ReactNode; invalid?: boolean; disabled?: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`pf-row${invalid ? " pf-row-invalid" : ""}`} data-opens={opens} disabled={disabled} onClick={onOpen}>
      <span className="pf-row-label">{label}</span>
      <span className="pf-row-value">{value}</span>
      <ChevronIcon direction="right" />
    </button>
  );
}

/** The avatar row's value: the chosen picture, or words before a choice. */
const avatarValue = (avatar: string | null) => (avatar === null ? "Choose one" : <Avatar id={avatar} size={32} />);

// ---------- The fields, shared by both forms ----------

function UsernameField({
  id,
  name,
  onName,
  current,
  check,
  disabled,
  takenName,
  note,
  hint = "3 to 16 letters, numbers or underscores, starting with a letter. Please do not use your real name.",
}: {
  id: string;
  name: string;
  onName: (name: string) => void;
  current: string | null; // the own username, never "taken"
  check: UsernameCheck;
  disabled: boolean;
  takenName: string | null;
  note?: ReactNode;
  hint?: string;
}) {
  const unchanged = current !== null && name === current;
  const taken = (takenName !== null && takenName === name) || (!unchanged && check.availability === "taken");
  const problems = name.length > 0 && !unchanged ? check.problems : [];
  const status: Record<string, string> = {
    idle: "",
    checking: "Checking…",
    available: "Available",
    taken: "Taken. Please choose another.",
    offline: "Could not check right now. You can still try Save.",
    limited: "Checking is paused for a moment.",
  };
  const availability = taken ? "taken" : unchanged ? "idle" : check.availability;
  const helpId = `${id}-help`;
  return (
    <div className="pf-field">
      <label htmlFor={id} className="lb-field-label">
        Username
      </label>
      <input
        id={id}
        className={`lb-input${problems.length > 0 || taken ? " lb-input-invalid" : ""}`}
        value={name}
        maxLength={USERNAME_MAX + 8}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-invalid={problems.length > 0 || taken}
        aria-describedby={helpId}
        disabled={disabled}
        onChange={(event) => onName(event.target.value)}
      />
      <div id={helpId} className="lb-field-help">
        {problems.length > 0 ? (
          <ul className="lb-rules">
            {problems.map((rule) => (
              <li key={rule}>{USERNAME_MESSAGES[rule]}</li>
            ))}
          </ul>
        ) : (
          hint && <p className="lb-hint">{hint}</p>
        )}
        <p className={`lb-availability lb-availability-${availability}`} aria-live="polite">
          {status[availability]}
        </p>
        {note}
      </div>
    </div>
  );
}

/**
 * The live check of the typed name (none while it is the player's own), and
 * whether it may be saved: it passes the rules and is not known to be taken.
 */
function useNameCheck(name: string, current: string | null, takenName: string | null): { check: UsernameCheck; ready: boolean } {
  const unchanged = current !== null && name === current;
  const check = useUsernameCheck(unchanged ? "" : name);
  const ready = unchanged || (name.length > 0 && check.problems.length === 0 && check.availability !== "taken" && takenName !== name);
  return { check, ready };
}

function AvatarPicker({ value, onChange, disabled }: { value: string | null; onChange: (id: string) => void; disabled: boolean }) {
  const [category, setCategory] = useState<AvatarCategory>(() => categoryOf(value) ?? "men");
  const ids = useId();
  const avatars = avatarsIn(category);
  const gridRef = useRef<HTMLDivElement>(null);
  // Arrow keys move through the grid, as in a radio group.
  const onKey = (event: KeyboardEvent, index: number) => {
    const columns = Math.max(1, Math.round((gridRef.current?.clientWidth ?? 300) / 76));
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(avatars.length - 1, index + step));
    onChange(avatars[next]!);
    gridRef.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };
  const focusable = avatars.includes(value ?? "") ? value : avatars[0];
  return (
    <div className="pf-field">
      <span className="lb-field-label pf-label-icon" id={`${ids}-label`}>
        <PictureIcon />
        Avatar
      </span>
      <div className="pf-categories" role="group" aria-label="Show avatars for">
        {AVATAR_CATEGORIES.map((option) => (
          <button
            key={option.id}
            type="button"
            className="pf-category"
            aria-pressed={category === option.id}
            disabled={disabled}
            onClick={() => setCategory(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div ref={gridRef} className="pf-avatars" role="radiogroup" aria-labelledby={`${ids}-label`}>
        {avatars.map((id, index) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            aria-label={`Avatar ${index + 1} of ${avatars.length}`}
            tabIndex={id === focusable ? 0 : -1}
            className="pf-avatar"
            disabled={disabled}
            onClick={() => onChange(id)}
            onKeyDown={(event) => onKey(event, index)}
          >
            <Avatar id={id} size={60} />
          </button>
        ))}
      </div>
    </div>
  );
}

function SaveLine({ state }: { state: SaveState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "error") {
    return (
      <p className="pf-save-line pf-save-error" role="alert">
        {state.text}
      </p>
    );
  }
  return (
    <p className={`pf-save-line pf-save-${state.kind}`} role="status">
      {state.kind === "saving" ? "Saving…" : "Saved."}
    </p>
  );
}


// ---------- Making a profile ----------

// The first page lists the three choices as rows; the username and the
// avatar each open a page of their own, the country its own picker. The
// public notice and Save sit beside them, so nothing scrolls.
function CreateProfile({
  head,
  firstGame,
  onDone,
  onBack,
  onTerms,
}: {
  head: Head;
  firstGame: boolean;
  onDone: () => void;
  onBack: () => void;
  onTerms: () => void;
}) {
  const { profile } = useLeaderboardProfile();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [takenName, setTakenName] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const ids = useId();
  const { check, ready: nameReady } = useNameCheck(name, null, takenName);
  const { page, open, back, onKeyDown } = usePages<"name" | "avatar">();
  const saving = save.kind === "saving";

  if (profile && save.kind === "saved") {
    return (
      <>
        {head("Create your profile")}
        <Saved profile={profile} firstGame={firstGame} onDone={onDone} />
      </>
    );
  }

  const missing = [
    !nameReady && "a username",
    avatar === null && "an avatar",
    country === null && "a country (or no flag)",
  ].filter(Boolean) as string[];
  const canSave = missing.length === 0 && understood && !saving;
  // "To save, add a username and an avatar, and tick I understand."
  const stillNeeded = [missing.length > 0 && `add ${listText(missing)}`, !understood && "tick “I understand”"].filter(Boolean) as string[];

  const submit = async () => {
    if (!canSave || avatar === null || country === null) return;
    setSave({ kind: "saving" });
    const result = await leaderboardApi.claimUsername(name, country, avatar);
    if (result.kind === "ok") {
      setSave({ kind: "saved" });
      return;
    }
    if (result.kind === "failed" && result.code === "taken") setTakenName(name);
    setSave({ kind: "error", text: saveProblemText(result) });
  };

  if (page === "name") {
    return (
      <div className="pf-page" onKeyDown={onKeyDown}>
        {head("Username", { back, backLabel: "Back to your profile" })}
        <section className="pf-sub">
          <UsernameField id={`${ids}-name`} name={name} onName={setName} current={null} check={check} disabled={saving} takenName={takenName} />
        </section>
        <DoneButton onDone={back} />
      </div>
    );
  }
  if (page === "avatar") {
    return (
      <div className="pf-page" onKeyDown={onKeyDown}>
        {head("Avatar", { back, backLabel: "Back to your profile" })}
        <section className="pf-sub">
          <AvatarPicker value={avatar} onChange={setAvatar} disabled={saving} />
        </section>
        <DoneButton onDone={back} />
      </div>
    );
  }

  return (
    <form
      className="pf-page pf-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {head("Create your profile")}
      <p className="pf-intro">
        {firstGame ? "Before your first game against the AI, choose how you appear on the leaderboard. Your wins are then added automatically." : "Choose how you appear on the leaderboard."}
      </p>
      <div className="pf-columns">
        <section className="pf-rows">
          <Row opens="name" label="Username" value={name || "Choose one"} invalid={name.length > 0 && !nameReady} disabled={saving} onOpen={() => open("name")} />
          <Row opens="avatar" label="Avatar" value={avatarValue(avatar)} disabled={saving} onOpen={() => open("avatar")} />
          <div className="pf-row-country">
            <CountryPicker value={country} onChange={setCountry} disabled={saving} />
          </div>
          <LoginEntry onLoggedIn={onDone} />
        </section>

        <div className="pf-column">
          <section className="pf-notice">
            <p className="pf-public">{PUBLIC_NOTICE}</p>
            <label className="pf-check">
              <input type="checkbox" checked={understood} disabled={saving} onChange={(event) => setUnderstood(event.target.checked)} required />
              <span className="pf-check-box" aria-hidden="true" />
              <span>I understand</span>
            </label>
            <p className="lb-note">{BROWSER_NOTICE}</p>
            <button type="button" className="link-button lb-terms" onClick={onTerms}>
              Read the Terms and notices
            </button>
          </section>

          <div className="pf-status">
            <SaveLine state={save} />
            {!saving && save.kind !== "error" && (
              <p className="pf-missing" aria-live="polite">
                {stillNeeded.length > 0 ? `To save, ${stillNeeded.join(", and ")}.` : "Ready to save."}
              </p>
            )}
          </div>
          <div className="pf-actions">
            <button type="button" className="lb-button" disabled={saving} onClick={onBack}>
              Back
            </button>
            <button type="submit" className="lb-button lb-button-gold" aria-busy={saving} disabled={!canSave}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

/** Done on the username and avatar pages: back to the rows, the choice kept. */
function DoneButton({ onDone }: { onDone: () => void }) {
  return (
    <div className="pf-actions pf-actions-one">
      <button type="button" className="lb-button lb-button-gold" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

function Saved({ profile, firstGame, onDone }: { profile: Profile; firstGame: boolean; onDone: () => void }) {
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => doneRef.current?.focus({ preventScroll: true }), []);
  return (
    <section className="pf-panel pf-saved" role="status">
      <span className="lb-ring-gold pf-saved-avatar">
        <Avatar id={profile.avatar} size={96} />
      </span>
      <p className="pf-saved-name">
        <Flag code={profile.country} decorative />
        <span className="lb-name">{profile.username}</span>
      </p>
      <p className="pf-saved-text">Your profile is saved. Your wins against the AI are now added to the leaderboard automatically.</p>
      <button ref={doneRef} type="button" className="lb-button lb-button-gold" onClick={onDone}>
        {firstGame ? "Continue to the game" : "Done"}
      </button>
    </section>
  );
}

// ---------- The own profile ----------

/** The compact card at the top of the own profile: avatar with its flag, name, country (D64a). */
function IdentityCard({ profile, onEdit, titleId }: { profile: Profile; onEdit: (() => void) | undefined; titleId: string }) {
  return (
    <section className="pf-id" aria-labelledby={titleId}>
      <span className="pf-id-laurel" aria-hidden="true">
        <LbLaurel />
      </span>
      <div className="pf-id-avatar">
        <span className="lb-ring-gold pf-id-ring">
          <Avatar id={profile.avatar} size={76} />
        </span>
        {profile.country !== null && (
          <span className="lb-pic-flag pf-id-flag" aria-hidden="true">
            <Flag code={profile.country} decorative />
          </span>
        )}
        {/* A small gold badge; the button around it keeps a 44px target. */}
        {onEdit && (
          <button type="button" className="lb-hero-edit pf-id-edit" aria-label="Edit your profile" onClick={onEdit}>
            <span className="pf-id-edit-badge">
              <PencilIcon />
            </span>
          </button>
        )}
      </div>
      <span className="pf-id-divider" aria-hidden="true" />
      <div className="pf-id-who">
        <h2 id={titleId} className="pf-id-name lb-name">
          {profile.username}
        </h2>
        <p className="pf-id-place">
          <span className="pf-id-pin" aria-hidden="true">
            <PinIcon />
          </span>
          <span className="lb-name">{countryName(profile.country)}</span>
          <span className="lb-you">You</span>
        </p>
      </div>
      <span className="pf-id-laurel" aria-hidden="true">
        <LbLaurel flip />
      </span>
    </section>
  );
}

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/**
 * The stats in little room: the totals on one strip, the best win and
 * the week's rank as two small boxes, and rows that open the table by level
 * and the reports.
 */
function CompactStats({ stats, onOpen }: { stats: ProfileResponse; onOpen: (page: "levels" | "reports") => void }) {
  // Always the own profile: the reports as this device and the server count them (D85).
  const reports = useShownConduct(stats.conduct);
  const numbers = [
    { key: "games", label: "Games", value: String(stats.gamesPlayed) },
    { key: "wins", label: "Wins", value: String(stats.wins) },
    { key: "losses", label: "Losses", value: String(stats.losses) },
    { key: "rate", label: "Win rate", value: stats.winRate === null ? "None" : percent(stats.winRate) },
  ];
  return (
    <>
      <dl className="pf-strip">
        {numbers.map((item) => (
          <div key={item.key} className={`pf-strip-item pf-strip-${item.key}`}>
            <dt>{item.label}</dt>
            <dd className="lb-stat-number">{item.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="pf-facts">
        <div className="pf-fact">
          <span className="pf-fact-icon" aria-hidden="true">
            <LbStar />
          </span>
          <dt>Best win</dt>
          <dd>{stats.bestWin ? `${stats.bestWin.moves} moves on ${AI_LEVELS[stats.bestWin.level].name}` : "No wins yet"}</dd>
        </div>
        <div className="pf-fact pf-fact-week">
          <span className="pf-fact-icon" aria-hidden="true">
            <LbBars rank />
          </span>
          <dt>This week on Strongest</dt>
          <dd>{stats.weeklyStrongestRank !== null ? `Rank ${stats.weeklyStrongestRank}` : "Not ranked yet"}</dd>
        </div>
      </dl>
      <div className="pf-rows">
        <Row opens="levels" label="Results by level" value={`${stats.draws ?? 0} ${(stats.draws ?? 0) === 1 ? "draw" : "draws"}`} onOpen={() => onOpen("levels")} />
        <Row opens="reports" label="Reports" value={String(reports.totalReports)} onOpen={() => onOpen("reports")} />
      </div>
    </>
  );
}

/** The table by level, on its own page. */
function LevelsTable({ stats }: { stats: ProfileResponse }) {
  return (
    <table className="lb-levels pf-levels">
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
        {[...stats.byLevel].reverse().map((record) => (
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
  );
}

/** The own reports for abandoned games (D85), on their own page. */
function ReportsPage({ server }: { server: ConductStatus | undefined }) {
  const conduct = useShownConduct(server);
  const until = conduct.suspendedUntil === null ? null : Date.parse(conduct.suspendedUntil);
  const suspended = until !== null && !Number.isNaN(until) && until > Date.now();
  return (
    <section className="pf-sub pf-reports">
      <p className="pf-reports-count">
        <span className="lb-stat-number">{conduct.totalReports}</span>
        <span>{conduct.totalReports === 1 ? "report in all" : "reports in all"}</span>
      </p>
      <p className="pf-reports-line">{suspended ? `Suspended until ${longDate(until)}.` : reportsLeftText(Math.max(1, REPORT_LIMIT - conduct.reports))}</p>
    </section>
  );
}

type Stats = { kind: "loading" } | { kind: "problem"; problem: Problem } | { kind: "ready"; profile: ProfileResponse };
type OwnPage = "levels" | "reports" | "edit" | "name" | "avatar" | "account";

function EditProfile({ head, profile, onTerms }: { head: Head; profile: Profile; onTerms: () => void }) {
  const [stats, setStats] = useState<Stats>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [nextRename, setNextRename] = useState<string | null>(null);
  // D64a: the profile opens as a view; the pencil on the avatar opens the
  // edit page, whose username and avatar rows open pages of their own.
  const { page, open, back, onKeyDown } = usePages<OwnPage>({ name: "edit", avatar: "edit" });
  const accountsOn = useAccountsEnabled();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [name, setName] = useState(profile.username);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const [country, setCountry] = useState<string>(profile.country ?? NO_COUNTRY);
  const [takenName, setTakenName] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const ids = useId();

  useEffect(() => {
    const controller = new AbortController();
    setStats({ kind: "loading" });
    leaderboardApi
      .profile(profile.username, controller.signal)
      .then((result) => {
        if (result.kind === "ok") {
          setStats({ kind: "ready", profile: result.value });
          setNextRename(result.value.nextRenameAt ?? null);
          // The server's count of reports is the truth for the profile (D85).
          if (result.value.conduct) conductStore.applyServer(result.value.conduct);
        } else setStats({ kind: "problem", problem: problemOf(result) });
      })
      .catch(() => {});
    return () => controller.abort();
    // The stats follow the saved name, not the one being typed.
  }, [profile.username, attempt]);

  const { check, ready: nameReady } = useNameCheck(name, profile.username, takenName);
  const renameLocked = nextRename !== null && new Date(nextRename).getTime() > Date.now();
  const changes = {
    ...(name !== profile.username ? { username: name } : {}),
    ...(avatar !== null && avatar !== profile.avatar ? { avatar } : {}),
    ...(country !== (profile.country ?? NO_COUNTRY) ? { country } : {}),
  };
  const changed = Object.keys(changes).length > 0;
  const saving = save.kind === "saving";
  const canSave = changed && nameReady && !saving;

  const startEditing = () => {
    setName(profile.username);
    setAvatar(profile.avatar);
    setCountry(profile.country ?? NO_COUNTRY);
    setTakenName(null);
    setSave({ kind: "idle" });
    setJustSaved(false);
    open("edit");
  };

  const submit = async () => {
    if (!canSave) return;
    setSave({ kind: "saving" });
    const result = await leaderboardApi.updateProfile(changes);
    if (result.kind === "ok") {
      setNextRename(result.value.nextRenameAt);
      setSave({ kind: "idle" });
      setJustSaved(true);
      back();
      return;
    }
    if (result.kind === "failed" && result.code === "taken") setTakenName(name);
    if (result.kind === "failed" && result.code === "renameTooSoon" && result.nextRenameAt) setNextRename(result.nextRenameAt);
    setSave({ kind: "error", text: saveProblemText(result) });
  };

  const renameNote = (
    <p className={`pf-callout${renameLocked ? " pf-callout-locked" : ""}`} role={renameLocked ? "note" : undefined}>
      <span className="pf-callout-icon" aria-hidden="true">
        <LbCalendar tone="cream" />
      </span>
      {renameLocked
        ? `You changed your username recently. You can change it again on ${renameDateText(nextRename!)}.`
        : `You can change it once every ${RENAME_WAIT_DAYS} days.`}
    </p>
  );
  const rules = rulesOpen && (
    <InfoDialog title="Your username, flag and avatar" onClose={() => setRulesOpen(false)}>
      <ProfileRules onTerms={onTerms} />
    </InfoDialog>
  );
  const ready = stats.kind === "ready" ? stats.profile : null;

  if (page === "name") {
    return (
      <div className="pf-page" onKeyDown={onKeyDown}>
        {head("Username", { back, backLabel: "Back to Edit your profile" })}
        <section className="pf-sub">
          <UsernameField
            id={`${ids}-name`}
            name={name}
            onName={(next) => {
              setName(next);
              if (save.kind !== "saving") setSave({ kind: "idle" });
            }}
            current={profile.username}
            check={check}
            disabled={saving || renameLocked}
            takenName={takenName}
            note={renameNote}
            hint=""
          />
        </section>
        <DoneButton onDone={back} />
      </div>
    );
  }
  if (page === "avatar") {
    return (
      <div className="pf-page" onKeyDown={onKeyDown}>
        {head("Avatar", { back, backLabel: "Back to Edit your profile" })}
        <section className="pf-sub">
          <AvatarPicker
            value={avatar}
            onChange={(next) => {
              setAvatar(next);
              setSave({ kind: "idle" });
            }}
            disabled={saving}
          />
        </section>
        <DoneButton onDone={back} />
      </div>
    );
  }
  if (page === "edit") {
    return (
      <form
        className="pf-page pf-edit-card"
        noValidate
        onKeyDown={onKeyDown}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {head("Edit your profile", { back, backLabel: "Back to your profile", extra: <InfoButton label="Rules for your username, flag and avatar" onClick={() => setRulesOpen(true)} /> })}
        <section className="pf-rows">
          <Row opens="name" label="Username" value={name} invalid={!nameReady} disabled={saving} onOpen={() => open("name")} />
          <Row opens="avatar" label="Avatar" value={avatarValue(avatar)} disabled={saving} onOpen={() => open("avatar")} />
          <div className="pf-row-country">
            <CountryPicker
              value={country}
              onChange={(next) => {
                setCountry(next);
                setSave({ kind: "idle" });
              }}
              disabled={saving}
            />
          </div>
        </section>
        <SaveLine state={save} />
        <div className="pf-actions">
          <button type="button" className="lb-button" disabled={saving} onClick={back}>
            Cancel
          </button>
          <button type="submit" className="lb-button lb-button-gold" disabled={!canSave} aria-busy={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
        {rules}
      </form>
    );
  }
  if (page === "levels" && ready) {
    return (
      <div className="pf-page" onKeyDown={onKeyDown}>
        {head("Results by level", { back, backLabel: "Back to your profile" })}
        <LevelsTable stats={ready} />
      </div>
    );
  }
  if (page === "account") {
    return (
      <div className="pf-page" onKeyDown={onKeyDown}>
        {head("Saved progress", { back, backLabel: "Back to your profile" })}
        <AccountSection profile={profile} />
      </div>
    );
  }
  if (page === "reports" && ready) {
    return (
      <div className="pf-page" onKeyDown={onKeyDown}>
        {head("Reports", { back, backLabel: "Back to your profile" })}
        <ReportsPage server={ready.conduct} />
      </div>
    );
  }

  return (
    <div className="pf-page pf-edit">
      {head("Your profile")}
      <div className="pf-columns">
        <div className="pf-column">
          <IdentityCard profile={profile} onEdit={startEditing} titleId={`${ids}-who`} />
          {justSaved && (
            <p className="pf-save-line pf-save-saved pf-saved-note" role="status">
              Saved. Your profile is up to date.
            </p>
          )}
          {accountsOn && (
            <div className="pf-rows">
              <Row opens="account" label="Saved progress" value={profile.emailHint ?? "Not saved"} onOpen={() => open("account")} />
            </div>
          )}
        </div>
        <div className="pf-column pf-stats">
          {stats.kind === "loading" && (
            <div className="lb-stats-skeleton" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <span key={index} className="lb-bone lb-bone-card" />
              ))}
            </div>
          )}
          {stats.kind === "problem" && <ProblemPanel problem={stats.problem} compact onRetry={() => setAttempt((count) => count + 1)} />}
          {ready && <CompactStats stats={ready} onOpen={open} />}
        </div>
      </div>
    </div>
  );
}
