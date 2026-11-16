import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { playFeedback } from "./feedback";
import { haptics } from "./haptics";
import { settingsStore, useSettings } from "./settings";
import type { AnimationLevel, BoardTheme, Coordinates, HapticIntensity, PieceStyle, Settings } from "./settings";
import { voiceEngine } from "./voice/voiceEngine";
import { TermsDialog } from "./TermsDialog";
import { BackIcon, BoardIcon, ChatIcon, ChevronIcon, MicIcon, PlayIcon, SparkleIcon, SpeakerIcon, VibrateIcon } from "./icons";
import { Avatar } from "./leaderboard/Avatar";
import { Flag } from "./leaderboard/Flag";
import { CloseIcon, LbGradients } from "./leaderboard/lbIcons";
import { useLeaderboardProfile } from "./leaderboard/profile";

// ---------- Small controls (each at least 44px, keyboard friendly) ----------

/** An on or off switch: a real switch button with its label. */
function Switch({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="settings-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="settings-switch-label">{label}</span>
      <span className="settings-switch-track" aria-hidden="true">
        <span className="settings-switch-thumb" />
      </span>
    </button>
  );
}

type Options<T extends string> = readonly (readonly [T, string])[];

/** One choice among a few: radio buttons drawn as segments. */
function Choice<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  name: string;
  value: T;
  options: Options<T>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="settings-choice" disabled={disabled}>
      <legend>{label}</legend>
      <div className={`settings-segments settings-segments-${options.length}`}>
        {options.map(([option, text]) => (
          <label key={option} className="settings-segment">
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * One look among a few: radio buttons drawn as cards, each with a small
 * picture of what it gives (board colours, piece style, coordinates), so
 * the player sees the choice instead of reading about it.
 */
function Gallery<T extends string>({
  label,
  name,
  value,
  options,
  picture,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: Options<T>;
  picture: (option: T) => ReactNode;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="settings-choice">
      <legend>{label}</legend>
      <div className={`settings-cards settings-cards-${options.length}`}>
        {options.map(([option, text]) => (
          <label key={option} className="settings-pick">
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            <span className="settings-pick-face">
              {picture(option)}
              <span className="settings-pick-name">{text}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A slider with its label and the value as words or a number. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  show,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  show: (value: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  // The gold part of the track, up to the thumb (settings.css).
  const fill = { "--fill": `${((value - min) / (max - min)) * 100}%` } as CSSProperties;
  return (
    <label className="settings-slider">
      <span className="settings-slider-head">
        {label}
        <output>{show(value)}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-valuetext={show(value)} style={fill} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

/** A rounded group of controls, with a thin line between them. */
function Card({ children }: { children: ReactNode }) {
  return <div className="settings-card">{children}</div>;
}

const percent = (value: number) => `${Math.round(value * 100)} percent`;
const times = (value: number) => `${value.toFixed(2)}x`;
const nameOf = <T extends string>(options: Options<T>, value: T) => options.find(([option]) => option === value)?.[1] ?? "";

const HAPTICS: Options<HapticIntensity> = [
  ["off", "Off"],
  ["light", "Light"],
  ["standard", "Standard"],
  ["strong", "Strong"],
];
const LEVELS: Options<AnimationLevel> = [
  ["off", "Off"],
  ["reduced", "Reduced"],
  ["standard", "Standard"],
  ["cinematic", "Cinematic"],
];
const THEMES: Options<BoardTheme> = [
  ["classic", "Classic wood"],
  ["slate", "Dark slate"],
  ["felt", "Green felt"],
  ["minimal", "Minimal light"],
];
const PIECES: Options<PieceStyle> = [
  ["classic", "Classic"],
  ["flat", "Flat"],
  ["ringed", "Ringed"],
];
const COORDS: Options<Coordinates> = [
  ["off", "Off"],
  ["edge", "Edge"],
  ["squares", "In squares"],
];

// The small pictures on the board cards. Drawn by settings.css with each
// option's own colours, since the page itself only shows the chosen one.
const themePicture = (theme: BoardTheme) => <span className={`settings-swatch settings-swatch-${theme}`} aria-hidden="true" />;
const piecePicture = (style: PieceStyle) => (
  <span className={`settings-discs settings-discs-${style}`} aria-hidden="true">
    <span className="settings-disc settings-disc-black" />
    <span className="settings-disc settings-disc-white" />
  </span>
);
const coordsPicture = (coords: Coordinates) => (
  <span className={`settings-coords settings-coords-${coords}`} aria-hidden="true">
    <span className="settings-coords-board" />
    {coords !== "off" && (
      <>
        <span className="settings-coords-file">a</span>
        <span className="settings-coords-rank">1</span>
      </>
    )}
  </span>
);

// A voice's language in words ("en-GB" becomes "British English") where the
// browser can say it; the code itself otherwise.
function languageName(lang: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(lang) ?? lang;
  } catch {
    return lang;
  }
}

// A voice's name without the language some devices add after a dash
// ("Microsoft David - English (United States)"): the row shows the language
// on its own line, and player text has no dashes.
const voiceName = (name: string) => name.replace(/\s+[-‐‑–—]\s+.*$/, "");

// The voice list's rows: English voices first (the game speaks English),
// then the rest, each group in the device's own order.
function voiceRows(voices: SpeechSynthesisVoice[]): { uri: string; name: string; lang: string }[] {
  const english = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith("en");
  return [...voices.filter(english), ...voices.filter((v) => !english(v))].map((v) => ({ uri: v.voiceURI, name: voiceName(v.name), lang: languageName(v.lang) }));
}

// The device's voices, kept up to date (they often arrive after a moment).
function useVoices(): { available: boolean; voices: SpeechSynthesisVoice[] } {
  const engine = voiceEngine();
  const [, setVersion] = useState(0);
  useEffect(() => engine.onVoicesChanged(() => setVersion((v) => v + 1)), [engine]);
  return { available: engine.available(), voices: engine.voices() };
}

// ---------- The pages ----------

/** The pages the tiles open. "voices" is the voice list, opened from AI voice. */
export type SettingsPage = "sound" | "haptics" | "voice" | "voices" | "animation" | "board" | "chat" | "profile";

const TITLES: Record<SettingsPage, string> = {
  sound: "Sound",
  haptics: "Haptics",
  voice: "AI voice",
  voices: "Voice",
  animation: "Animation",
  board: "Board and pieces",
  chat: "AI chat",
  profile: "Profile",
};

// Where Back goes; any page not listed goes back to the tiles.
const PARENT: Partial<Record<SettingsPage, SettingsPage>> = { voices: "voice" };

const AUTO_VOICE = "Best English voice (automatic)";

/** A tile on the first page: a gold symbol in a dark well, the name, and what it is set to now. */
function Tile({ page, icon, value, onOpen }: { page: SettingsPage; icon: ReactNode; value: string; onOpen: (page: SettingsPage) => void }) {
  return (
    <button type="button" className="settings-tile" data-opens={page} onClick={() => onOpen(page)}>
      <span className="settings-tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="settings-tile-title">{TITLES[page]}</span>
      <span className="settings-tile-value">{value}</span>
    </button>
  );
}

/** A row that opens a page of its own, showing what is chosen there now. */
function RowLink({ page, label, value, disabled = false, onOpen }: { page: SettingsPage; label: string; value: string; disabled?: boolean; onOpen: (page: SettingsPage) => void }) {
  return (
    <button type="button" className="settings-row-link" data-opens={page} disabled={disabled} onClick={() => onOpen(page)}>
      <span className="settings-row-label">{label}</span>
      <span className="settings-row-value">{value}</span>
      <ChevronIcon direction="right" />
    </button>
  );
}

// ---------- The sheet ----------

/**
 * Settings (D55), from the Menu and from the home screen. Every change
 * applies at once and is saved (settings.ts). Phone first: the first page
 * is a grid of tiles, each saying what it is set to now; a tile opens its
 * own page inside the same sheet, with Back to return. One column inside a
 * page, no sideways scrolling.
 */
// `onProfile` opens the Profile screen (D61); the sheet closes for it.
// `initialPage` opens straight on one page (the tests look at each page).
export function SettingsSheet({ onClose, onProfile, initialPage = null }: { onClose: () => void; onProfile?: (() => void) | undefined; initialPage?: SettingsPage | null }) {
  const settings = useSettings();
  const store = settingsStore();
  const update = (change: (s: Settings) => Settings) => store.update(change);
  const sound = (patch: Partial<Settings["sound"]>) => update((s) => ({ ...s, sound: { ...s.sound, ...patch } }));
  const voice = (patch: Partial<Settings["voice"]>) => update((s) => ({ ...s, voice: { ...s.voice, ...patch } }));
  const read = (patch: Partial<Settings["voice"]["read"]>) => update((s) => ({ ...s, voice: { ...s.voice, read: { ...s.voice.read, ...patch } } }));
  const animation = (patch: Partial<Settings["animation"]>) => update((s) => ({ ...s, animation: { ...s.animation, ...patch } }));
  const board = (patch: Partial<Settings["board"]>) => update((s) => ({ ...s, board: { ...s.board, ...patch } }));
  const { available, voices } = useVoices();
  const canVibrate = haptics().supported;
  const [confirmReset, setConfirmReset] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const { profile } = useLeaderboardProfile();

  const [page, setPage] = useState<SettingsPage | null>(initialPage);
  // The page Back just left, so focus returns to the tile or row that opened it.
  const leftPage = useRef<SettingsPage | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const open = (next: SettingsPage) => {
    leftPage.current = null;
    setPage(next);
  };
  const back = () => {
    if (!page) return;
    leftPage.current = page;
    setPage(PARENT[page] ?? null);
  };
  // Each page starts at its top, with the keyboard on Back (or, coming
  // back, on what opened the page left; on the first page, on Close).
  useEffect(() => {
    if (dialogRef.current) dialogRef.current.scrollTop = 0;
    const opener = leftPage.current && dialogRef.current?.querySelector<HTMLElement>(`[data-opens="${leftPage.current}"]`);
    if (opener) opener.focus();
    else if (page) backRef.current?.focus();
    else closeRef.current?.focus();
  }, [page]);

  const testSound = () => {
    playFeedback("move", { column: 2 });
    setTimeout(() => playFeedback("capture", { column: 5 }), 280);
  };
  // Says a line in the chosen voice, or in `voiceURI` to hear one before choosing it.
  const testVoice = (voiceURI: string | null = settings.voice.voiceURI) => {
    voiceEngine().unlock();
    voiceEngine().speak("Your move. Let us see what you have, haha.", 2, { ...settings.voice, voiceURI, enabled: true });
  };
  const parent = page ? PARENT[page] : undefined;
  const chosenVoice = voices.find((v) => v.voiceURI === settings.voice.voiceURI);

  const pages: Record<SettingsPage, () => ReactNode> = {
    sound: () => (
      <>
        <Card>
          <Switch label="Sound" checked={settings.sound.enabled} onChange={(on) => sound({ enabled: on })} />
          <Slider label="Volume" value={settings.sound.volume} min={0} max={1} step={0.05} show={percent} disabled={!settings.sound.enabled} onChange={(v) => sound({ volume: v })} />
        </Card>
        <Card>
          <Switch label="Game sounds" checked={settings.sound.effects} disabled={!settings.sound.enabled} onChange={(on) => sound({ effects: on })} />
          <Switch label="Interface sounds" checked={settings.sound.interface} disabled={!settings.sound.enabled} onChange={(on) => sound({ interface: on })} />
        </Card>
        <button type="button" className="button settings-test" onClick={testSound}>
          <PlayIcon />
          Test sound
        </button>
      </>
    ),
    haptics: () =>
      canVibrate ? (
        <>
          <Choice label="Vibration" name="haptics" value={settings.haptics} options={HAPTICS} onChange={(v) => update((s) => ({ ...s, haptics: v }))} />
          <button type="button" className="button settings-test" disabled={settings.haptics === "off"} onClick={() => haptics().pulse([12, 40, 25], settings.haptics)}>
            <PlayIcon />
            Test vibration
          </button>
        </>
      ) : (
        <p className="settings-note">This device cannot vibrate from a web page (iPhone and iPad do not allow it), so a tap that does nothing gives a small shake instead.</p>
      ),
    voice: () => (
      <>
        <p className="settings-note">If you use a screen reader, keep the AI voice off: the chat bubble is already read to you.</p>
        {available ? (
          <>
            <Card>
              <Switch
                label="AI voice"
                checked={settings.voice.enabled}
                onChange={(on) => {
                  if (on) voiceEngine().unlock(); // inside this tap, for iOS
                  voice({ enabled: on });
                }}
              />
              <RowLink page="voices" label="Voice" value={chosenVoice ? voiceName(chosenVoice.name) : AUTO_VOICE} disabled={!settings.voice.enabled} onOpen={open} />
            </Card>
            <Card>
              <Slider label="Speed" value={settings.voice.rate} min={0.5} max={2} step={0.05} show={times} disabled={!settings.voice.enabled} onChange={(v) => voice({ rate: v })} />
              <Slider label="Pitch" value={settings.voice.pitch} min={0.5} max={2} step={0.05} show={times} disabled={!settings.voice.enabled} onChange={(v) => voice({ pitch: v })} />
              <Slider label="Voice volume" value={settings.voice.volume} min={0} max={1} step={0.05} show={percent} disabled={!settings.voice.enabled} onChange={(v) => voice({ volume: v })} />
            </Card>
            <fieldset className="settings-group" disabled={!settings.voice.enabled}>
              <legend>Read aloud</legend>
              <Card>
                <Switch label="The AI's reactions" checked={settings.voice.read.reactions} onChange={(on) => read({ reactions: on })} />
                <Switch label="Greetings" checked={settings.voice.read.greetings} onChange={(on) => read({ greetings: on })} />
                <Switch label="The game over line" checked={settings.voice.read.gameOver} onChange={(on) => read({ gameOver: on })} />
                <Switch label="Lines while you wait" checked={settings.voice.read.idle} onChange={(on) => read({ idle: on })} />
                <Switch label="Tips and Why" checked={settings.voice.read.tips} onChange={(on) => read({ tips: on })} />
              </Card>
            </fieldset>
            <button type="button" className="button settings-test" onClick={() => testVoice()}>
              <PlayIcon />
              Test voice
            </button>
          </>
        ) : (
          <p className="settings-note">This browser has no speech voices, so the AI voice is not available here.</p>
        )}
      </>
    ),
    // Every voice on the device as a row: tap the row to choose it, or the
    // play button beside it to hear it first.
    voices: () => (
      <fieldset className="settings-group" disabled={!settings.voice.enabled}>
        <legend className="settings-visually-hidden">Voice</legend>
        <div className="settings-voices">
          {[{ uri: "", name: AUTO_VOICE, lang: "" }, ...voiceRows(voices)].map(({ uri, name, lang }) => (
            <div key={uri} className="settings-voice">
              <label className="settings-voice-pick">
                <input type="radio" name="voice" value={uri} checked={(settings.voice.voiceURI ?? "") === uri} onChange={() => voice({ voiceURI: uri || null })} />
                <span className="settings-voice-text">
                  <span className="settings-voice-name">{name}</span>
                  {lang && <span className="settings-voice-lang">{lang}</span>}
                </span>
                <span className="settings-voice-tick" aria-hidden="true" />
              </label>
              <button type="button" className="settings-voice-play" aria-label={`Hear ${name}`} onClick={() => testVoice(uri || null)}>
                <PlayIcon />
              </button>
            </div>
          ))}
        </div>
      </fieldset>
    ),
    animation: () => (
      <>
        <Choice label="Animation" name="animation" value={settings.animation.level} options={LEVELS} onChange={(v) => animation({ level: v })} />
        <Card>
          <Slider
            label="Speed"
            value={settings.animation.speed}
            min={0.75}
            max={1.5}
            step={0.05}
            show={times}
            disabled={settings.animation.level === "off" || settings.animation.level === "reduced"}
            onChange={(v) => animation({ speed: v })}
          />
        </Card>
      </>
    ),
    board: () => (
      <>
        <Gallery label="Board" name="theme" value={settings.board.theme} options={THEMES} picture={themePicture} onChange={(v) => board({ theme: v })} />
        <Gallery label="Pieces" name="pieces" value={settings.board.pieces} options={PIECES} picture={piecePicture} onChange={(v) => board({ pieces: v })} />
        <Gallery label="Coordinates" name="coordinates" value={settings.board.coordinates} options={COORDS} picture={coordsPicture} onChange={(v) => board({ coordinates: v })} />
        <Card>
          <Switch label="Show legal moves" checked={settings.board.legalMoves} onChange={(on) => board({ legalMoves: on })} />
          <Switch label="Show the last move" checked={settings.board.lastMove} onChange={(on) => board({ lastMove: on })} />
        </Card>
      </>
    ),
    chat: () => (
      <>
        <Card>
          <Switch label="Show chat bubbles" checked={settings.chat.bubbles} onChange={(on) => update((s) => ({ ...s, chat: { bubbles: on } }))} />
        </Card>
        <p className="settings-note">This only hides the bubbles. What the AI may say, the 18+ badge and its consent stay the same.</p>
      </>
    ),
    profile: () => (
      <>
        {profile ? (
          <p className="settings-profile">
            <Avatar id={profile.avatar} size={40} />
            <span className="settings-profile-name">
              <Flag code={profile.country} decorative />
              <span className="lb-name">{profile.username}</span>
            </span>
          </p>
        ) : (
          <p className="settings-note">No leaderboard profile on this device yet.</p>
        )}
        {onProfile && (
          <button type="button" className="button settings-profile-open" onClick={onProfile}>
            {profile ? "Open your profile" : "Create your profile"}
          </button>
        )}
        <p className="settings-note">Wins against the AI are added to the leaderboard automatically. Your profile is kept in this browser; clearing your browser data loses it.</p>
      </>
    ),
  };

  const tiles = (
    <>
      <p className="settings-saved">Changes apply at once and are saved on this device.</p>
      <div className="settings-tiles">
        <Tile page="sound" icon={<SpeakerIcon />} value={settings.sound.enabled ? `On, ${percent(settings.sound.volume)}` : "Off"} onOpen={open} />
        <Tile page="haptics" icon={<VibrateIcon />} value={canVibrate ? nameOf(HAPTICS, settings.haptics) : "Not on this device"} onOpen={open} />
        <Tile page="voice" icon={<MicIcon />} value={!available ? "Not available here" : settings.voice.enabled ? "On" : "Off"} onOpen={open} />
        <Tile page="animation" icon={<SparkleIcon />} value={nameOf(LEVELS, settings.animation.level)} onOpen={open} />
        <Tile page="board" icon={<BoardIcon />} value={nameOf(THEMES, settings.board.theme)} onOpen={open} />
        <Tile page="chat" icon={<ChatIcon />} value={settings.chat.bubbles ? "Bubbles shown" : "Bubbles hidden"} onOpen={open} />
        <button type="button" className="settings-tile settings-tile-wide" data-opens="profile" onClick={() => open("profile")}>
          <Avatar id={profile?.avatar ?? null} size={40} />
          <span className="settings-tile-text">
            <span className="settings-tile-title">Profile</span>
            <span className="settings-tile-value">{profile ? profile.username : "Not set up yet"}</span>
          </span>
          <ChevronIcon direction="right" />
        </button>
      </div>
      <button type="button" className="button settings-reset" onClick={() => setConfirmReset(true)}>
        Reset to defaults
      </button>
    </>
  );

  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog settings-dialog gold-scroll"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // Escape steps back a page first, then closes.
          if (event.key !== "Escape" || confirmReset || termsOpen) return;
          if (page) back();
          else onClose();
        }}
      >
        <LbGradients />
        <div className="settings-head">
          {page && (
            <button ref={backRef} type="button" className="settings-icon-button settings-back" aria-label={`Back to ${parent ? TITLES[parent] : "all settings"}`} onClick={back}>
              <BackIcon />
            </button>
          )}
          <h2 id="settings-title" className="dialog-title settings-title">
            {page ? TITLES[page] : "Settings"}
          </h2>
          <button ref={closeRef} type="button" className="settings-icon-button settings-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* The key restarts the short slide in on every page change. */}
        <div key={page ?? "tiles"} className={page ? "settings-page settings-body" : "settings-page"}>
          {page ? pages[page]() : tiles}
        </div>

        {termsOpen && createPortal(<TermsDialog onClose={() => setTermsOpen(false)} />, document.body)}

        {/* Under <body>, so the sheet's own layout cannot trap it. */}
        {confirmReset &&
          createPortal(
          <ConfirmDialog
            question="Reset every setting to its default?"
            confirmLabel="Yes, reset"
            cancelLabel="Cancel"
            onConfirm={() => {
              store.reset();
              setConfirmReset(false);
            }}
            onCancel={() => setConfirmReset(false)}
          />,
          document.body,
        )}
      </div>
    </div>
  );
}
