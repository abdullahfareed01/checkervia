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
// The own profile (D64) opens as a view: the avatar, flag and stats. A
// pencil on the avatar turns the same screen into the form, with an (i)
// that shows the rules for the username, flag and avatar; Cancel or Save
// returns to the view.
// The username can change once every 7 days (the screen says when the next
// change is allowed); the old name stays reserved for 30 days. The avatar
// and the flag can change any time. Saving, saved and the three problem
// messages (D59) are shown under Save.
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { NO_COUNTRY, RENAME_WAIT_DAYS } from "../../leaderboard/protocol";
import type { ProfileResponse } from "../../leaderboard/protocol";
import { USERNAME_MAX, USERNAME_MESSAGES } from "../../leaderboard/username";
import { leaderboardApi } from "./api";
import type { ApiResult } from "./api";
import { AVATAR_CATEGORIES, Avatar, avatarsIn, categoryOf } from "./Avatar";
import type { AvatarCategory } from "./Avatar";
import { CountryPicker } from "./CountryPicker";
import { Flag, countryName } from "./Flag";
import { CloseIcon, LbCalendar, LbGradients, LbLaurel, PencilIcon, PersonIcon, PictureIcon, PinIcon } from "./lbIcons";
import { useLeaderboardProfile } from "./profile";
import type { Profile } from "./profile";
import { ProblemPanel, problemOf, problemText } from "./Problem";
import type { Problem } from "./Problem";
import { InfoButton, InfoDialog, ProfileRules } from "./InfoDialog";
import { ProfileStats } from "./ProfileSheet";
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
  const title = creating ? "Create your profile" : "Your profile";
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
        <header className="lb-head">
          <span className="lb-head-spacer" aria-hidden="true" />
          <h2 id={`${ids}-title`} className="lb-title pf-title">
            <span className="pf-title-icon" aria-hidden="true">
              <PersonIcon />
            </span>
            <span className="lb-title-text">{title}</span>
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="lb-close"
            aria-label={firstGame ? "Back to the home screen" : "Close your profile"}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        {creating ? (
          <CreateProfile
            firstGame={firstGame}
            onDone={() => (firstGame ? onSaved?.() : setCreating(false))}
            onBack={onClose}
            onTerms={onTerms}
          />
        ) : (
          <EditProfile profile={profile} onTerms={onTerms} />
        )}
        <div className="lb-scenery" aria-hidden="true" />
      </div>
    </div>
  );
}

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

function CreateProfile({
  firstGame,
  onDone,
  onBack,
  onTerms,
}: {
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
  const saving = save.kind === "saving";

  if (profile && save.kind === "saved") return <Saved profile={profile} firstGame={firstGame} onDone={onDone} />;

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

  return (
    <form
      className="pf-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="pf-intro">
        {firstGame ? "Before your first game against the AI, choose how you appear on the leaderboard. Your wins are then added automatically." : "Choose how you appear on the leaderboard."}
      </p>
      <section className="pf-panel">
        <UsernameField id={`${ids}-name`} name={name} onName={setName} current={null} check={check} disabled={saving} takenName={takenName} />
        <AvatarPicker value={avatar} onChange={setAvatar} disabled={saving} />
        <CountryPicker value={country} onChange={setCountry} disabled={saving} />
      </section>

      <section className="pf-panel pf-notice">
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

      <SaveLine state={save} />
      {stillNeeded.length > 0 && !saving && (
        <p className="pf-missing" aria-live="polite">
          To save, {stillNeeded.join(", and ")}.
        </p>
      )}
      <div className="pf-actions">
        <button type="button" className="lb-button" disabled={saving} onClick={onBack}>
          Back
        </button>
        <button type="submit" className="lb-button lb-button-gold" aria-busy={saving} disabled={!canSave}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
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

// ---------- Editing ----------

/** The compact card at the top of the own profile: avatar with its flag, name, country (D64). */
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
        {onEdit && (
          <button type="button" className="lb-hero-edit pf-id-edit" aria-label="Edit your profile" onClick={onEdit}>
            <PencilIcon />
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

type Stats = { kind: "loading" } | { kind: "problem"; problem: Problem } | { kind: "ready"; profile: ProfileResponse };

function EditProfile({ profile, onTerms }: { profile: Profile; onTerms: () => void }) {
  const [stats, setStats] = useState<Stats>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [nextRename, setNextRename] = useState<string | null>(null);
  // D64: the profile opens as a view; the pencil on the avatar opens the form here.
  const [editing, setEditing] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [name, setName] = useState(profile.username);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const [country, setCountry] = useState<string>(profile.country ?? NO_COUNTRY);
  const [takenName, setTakenName] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const ids = useId();
  const formRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStats({ kind: "loading" });
    leaderboardApi
      .profile(profile.username, controller.signal)
      .then((result) => {
        if (result.kind === "ok") {
          setStats({ kind: "ready", profile: result.value });
          setNextRename(result.value.nextRenameAt ?? null);
        } else setStats({ kind: "problem", problem: problemOf(result) });
      })
      .catch(() => {});
    return () => controller.abort();
    // The stats follow the saved name, not the one being typed.
  }, [profile.username, attempt]);

  // The form takes the focus when it opens.
  useEffect(() => {
    if (editing) formRef.current?.focus({ preventScroll: false });
  }, [editing]);

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
    setEditing(true);
  };

  const submit = async () => {
    if (!canSave) return;
    setSave({ kind: "saving" });
    const result = await leaderboardApi.updateProfile(changes);
    if (result.kind === "ok") {
      setNextRename(result.value.nextRenameAt);
      setSave({ kind: "idle" });
      setEditing(false);
      setJustSaved(true);
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

  return (
    <div className="pf-edit">
      <IdentityCard profile={profile} onEdit={editing ? undefined : startEditing} titleId={`${ids}-who`} />
      {justSaved && (
        <p className="pf-save-line pf-save-saved pf-saved-note" role="status">
          Saved. Your profile is up to date.
        </p>
      )}

      {!editing && (
        <div className="lb-hero lb-hero-plain pf-hero">
          <div className="lb-hero-card pf-stats-card">
            {stats.kind === "loading" && (
              <div className="lb-stats-skeleton" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <span key={index} className="lb-bone lb-bone-card" />
                ))}
              </div>
            )}
            {stats.kind === "problem" && <ProblemPanel problem={stats.problem} compact onRetry={() => setAttempt((count) => count + 1)} />}
            {stats.kind === "ready" && <ProfileStats profile={stats.profile} />}
          </div>
        </div>
      )}

      {editing && (
        <form
          className="pf-edit-card"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="pf-edit-head">
            <span className="pf-edit-pencil" aria-hidden="true">
              <PencilIcon />
            </span>
            <h3 ref={formRef} tabIndex={-1} className="pf-section-title">
              Edit your profile
            </h3>
            <InfoButton label="Rules for your username, flag and avatar" onClick={() => setRulesOpen(true)} />
          </div>
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
          <section className="pf-sub">
            <CountryPicker
              value={country}
              onChange={(next) => {
                setCountry(next);
                setSave({ kind: "idle" });
              }}
              disabled={saving}
            />
          </section>
          <SaveLine state={save} />
          <div className="pf-actions">
            <button type="button" className="lb-button" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="lb-button lb-button-gold" disabled={!canSave} aria-busy={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      )}

      {rulesOpen && (
        <InfoDialog title="Your username, flag and avatar" onClose={() => setRulesOpen(false)}>
          <ProfileRules onTerms={onTerms} />
        </InfoDialog>
      )}
    </div>
  );
}
