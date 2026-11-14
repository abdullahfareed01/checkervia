import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { playFeedback } from "./feedback";
import { haptics } from "./haptics";
import { settingsStore, useSettings } from "./settings";
import type { AnimationLevel, BoardTheme, Coordinates, HapticIntensity, PieceStyle, Settings } from "./settings";
import { voiceEngine } from "./voice/voiceEngine";
import { TermsDialog } from "./TermsDialog";
import { Avatar } from "./leaderboard/Avatar";
import { Flag } from "./leaderboard/Flag";
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
  options: readonly (readonly [T, string])[];
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
  return (
    <label className="settings-slider">
      <span className="settings-slider-head">
        {label}
        <output>{show(value)}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-valuetext={show(value)} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

/** A section that opens and closes (closed sections keep the sheet short). */
function Section({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="settings-section" open={open}>
      <summary>{title}</summary>
      <div className="settings-body">{children}</div>
    </details>
  );
}

const percent = (value: number) => `${Math.round(value * 100)} percent`;
const times = (value: number) => `${value.toFixed(2)}x`;

const HAPTICS: readonly (readonly [HapticIntensity, string])[] = [
  ["off", "Off"],
  ["light", "Light"],
  ["standard", "Standard"],
  ["strong", "Strong"],
];
const LEVELS: readonly (readonly [AnimationLevel, string])[] = [
  ["off", "Off"],
  ["reduced", "Reduced"],
  ["standard", "Standard"],
  ["cinematic", "Cinematic"],
];
const THEMES: readonly (readonly [BoardTheme, string])[] = [
  ["classic", "Classic wood"],
  ["slate", "Dark slate"],
  ["felt", "Green felt"],
  ["minimal", "Minimal light"],
];
const PIECES: readonly (readonly [PieceStyle, string])[] = [
  ["classic", "Classic"],
  ["flat", "Flat"],
  ["ringed", "Ringed"],
];
const COORDS: readonly (readonly [Coordinates, string])[] = [
  ["off", "Off"],
  ["edge", "Edge"],
  ["squares", "In squares"],
];

// The device's voices, kept up to date (they often arrive after a moment).
function useVoices(): { available: boolean; voices: SpeechSynthesisVoice[] } {
  const engine = voiceEngine();
  const [, setVersion] = useState(0);
  useEffect(() => engine.onVoicesChanged(() => setVersion((v) => v + 1)), [engine]);
  return { available: engine.available(), voices: engine.voices() };
}

// ---------- The sheet ----------

/**
 * Settings (D55), from the Menu and from the home screen. Every change
 * applies at once and is saved (settings.ts). Phone first: one column,
 * sections that open and close, no sideways scrolling.
 */
// `onProfile` opens the Profile screen (D61); the sheet closes for it.
export function SettingsSheet({ onClose, onProfile }: { onClose: () => void; onProfile?: (() => void) | undefined }) {
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
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  const testSound = () => {
    playFeedback("move", { column: 2 });
    setTimeout(() => playFeedback("capture", { column: 5 }), 280);
  };
  const testVoice = () => {
    voiceEngine().unlock();
    voiceEngine().speak("Your move. Let us see what you have, haha.", 2, { ...settings.voice, enabled: true });
  };

  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !confirmReset && !termsOpen) onClose();
        }}
      >
        <div className="settings-head">
          <h2 id="settings-title" className="dialog-title">
            Settings
          </h2>
          <button ref={closeRef} type="button" className="settings-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="settings-saved">Changes apply at once and are saved on this device.</p>

        <Section title="Sound" open>
          <Switch label="Sound" checked={settings.sound.enabled} onChange={(on) => sound({ enabled: on })} />
          <Slider label="Volume" value={settings.sound.volume} min={0} max={1} step={0.05} show={percent} disabled={!settings.sound.enabled} onChange={(v) => sound({ volume: v })} />
          <Switch label="Game sounds" checked={settings.sound.effects} disabled={!settings.sound.enabled} onChange={(on) => sound({ effects: on })} />
          <Switch label="Interface sounds" checked={settings.sound.interface} disabled={!settings.sound.enabled} onChange={(on) => sound({ interface: on })} />
          <button type="button" className="button settings-test" onClick={testSound}>
            Test sound
          </button>
        </Section>

        <Section title="Haptics">
          {canVibrate ? (
            <>
              <Choice label="Vibration" name="haptics" value={settings.haptics} options={HAPTICS} onChange={(v) => update((s) => ({ ...s, haptics: v }))} />
              <button type="button" className="button settings-test" disabled={settings.haptics === "off"} onClick={() => haptics().pulse([12, 40, 25], settings.haptics)}>
                Test vibration
              </button>
            </>
          ) : (
            <p className="settings-note">This device cannot vibrate from a web page (iPhone and iPad do not allow it), so a tap that does nothing gives a small shake instead.</p>
          )}
        </Section>

        <Section title="AI voice">
          <p className="settings-note">If you use a screen reader, keep the AI voice off: the chat bubble is already read to you.</p>
          {available ? (
            <>
              <Switch
                label="AI voice"
                checked={settings.voice.enabled}
                onChange={(on) => {
                  if (on) voiceEngine().unlock(); // inside this tap, for iOS
                  voice({ enabled: on });
                }}
              />
              <label className="settings-select">
                <span>Voice</span>
                <select value={settings.voice.voiceURI ?? ""} disabled={!settings.voice.enabled} onChange={(event) => voice({ voiceURI: event.target.value || null })}>
                  <option value="">Best English voice (automatic)</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </label>
              <Slider label="Speed" value={settings.voice.rate} min={0.5} max={2} step={0.05} show={times} disabled={!settings.voice.enabled} onChange={(v) => voice({ rate: v })} />
              <Slider label="Pitch" value={settings.voice.pitch} min={0.5} max={2} step={0.05} show={times} disabled={!settings.voice.enabled} onChange={(v) => voice({ pitch: v })} />
              <Slider label="Voice volume" value={settings.voice.volume} min={0} max={1} step={0.05} show={percent} disabled={!settings.voice.enabled} onChange={(v) => voice({ volume: v })} />
              <fieldset className="settings-group" disabled={!settings.voice.enabled}>
                <legend>Read aloud</legend>
                <Switch label="The AI's reactions" checked={settings.voice.read.reactions} onChange={(on) => read({ reactions: on })} />
                <Switch label="Greetings" checked={settings.voice.read.greetings} onChange={(on) => read({ greetings: on })} />
                <Switch label="The game over line" checked={settings.voice.read.gameOver} onChange={(on) => read({ gameOver: on })} />
                <Switch label="Lines while you wait" checked={settings.voice.read.idle} onChange={(on) => read({ idle: on })} />
                <Switch label="Tips and Why" checked={settings.voice.read.tips} onChange={(on) => read({ tips: on })} />
              </fieldset>
              <button type="button" className="button settings-test" onClick={testVoice}>
                Test voice
              </button>
            </>
          ) : (
            <p className="settings-note">This browser has no speech voices, so the AI voice is not available here.</p>
          )}
        </Section>

        <Section title="Animation">
          <Choice label="Animation" name="animation" value={settings.animation.level} options={LEVELS} onChange={(v) => animation({ level: v })} />
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
        </Section>

        <Section title="Board and pieces">
          <Choice label="Board" name="theme" value={settings.board.theme} options={THEMES} onChange={(v) => board({ theme: v })} />
          <Choice label="Pieces" name="pieces" value={settings.board.pieces} options={PIECES} onChange={(v) => board({ pieces: v })} />
          <Choice label="Coordinates" name="coordinates" value={settings.board.coordinates} options={COORDS} onChange={(v) => board({ coordinates: v })} />
          <Switch label="Show legal moves" checked={settings.board.legalMoves} onChange={(on) => board({ legalMoves: on })} />
          <Switch label="Show the last move" checked={settings.board.lastMove} onChange={(on) => board({ lastMove: on })} />
        </Section>

        <Section title="AI chat">
          <Switch label="Show chat bubbles" checked={settings.chat.bubbles} onChange={(on) => update((s) => ({ ...s, chat: { bubbles: on } }))} />
          <p className="settings-note">This only hides the bubbles. What the AI may say, the 18+ badge and its consent stay the same.</p>
        </Section>

        <Section title="Profile">
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
        </Section>

        <button type="button" className="button settings-reset" onClick={() => setConfirmReset(true)}>
          Reset to defaults
        </button>

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
