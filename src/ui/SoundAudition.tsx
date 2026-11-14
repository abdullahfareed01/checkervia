// DEVELOPMENT ONLY: a page to hear every sound and feel every vibration,
// opened with ?sounds while running the dev server. main.tsx only loads this
// file in development, so it is not in the production build. Edit the
// numbers in sound/soundConfig.ts and press a button again to hear the change.
// Styles are inline, so none of this page is in the app's stylesheet.
import { useState } from "react";
import { FEEDBACK, playFeedback } from "./feedback";
import type { FeedbackEvent } from "./feedback";
import { haptics } from "./haptics";
import { settingsStore, useSettings } from "./settings";
import { SOUNDS, soundLength } from "./sound/soundConfig";
import { soundEngine } from "./sound/soundEngine";

const EVENTS = Object.keys(FEEDBACK) as FeedbackEvent[];

export function SoundAudition() {
  const settings = useSettings();
  const [last, setLast] = useState("");

  const play = (event: FeedbackEvent, column = 3.5) => {
    soundEngine().unlock();
    playFeedback(event, { column });
    const entry = FEEDBACK[event];
    setLast(`${event}: ${entry.sound} (${soundLength(SOUNDS[entry.sound])} ms), vibration ${entry.haptic ? entry.haptic.join(", ") : "none"}`);
  };

  // A three hop multi jump, 260 ms apart, rising, the last one harder.
  const multiJump = () => {
    soundEngine().unlock();
    [0, 1, 2].forEach((hop) => setTimeout(() => playFeedback("hop", { hop, column: 1 + hop * 2, finalHop: hop === 2 }), hop * 260));
    setLast("multi jump: three rising hops");
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, display: "grid", gap: 12 }}>
      <h1>Sound audition</h1>
      <p>
        Development only. Vibration: {haptics().supported ? "available" : "not available on this device"}. Edit
        src/ui/sound/soundConfig.ts and play again.
      </p>
      <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
        Volume {Math.round(settings.sound.volume * 100)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.sound.volume}
          onChange={(event) => settingsStore().update((s) => ({ ...s, sound: { ...s.sound, volume: Number(event.target.value) } }))}
        />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
        {EVENTS.map((event) => (
          <button key={event} type="button" className="button" onClick={() => play(event)}>
            {event}
          </button>
        ))}
        <button type="button" className="button button-primary" onClick={multiJump}>
          multi jump
        </button>
        <button type="button" className="button" onClick={() => play("move", 0)}>
          move, far left
        </button>
        <button type="button" className="button" onClick={() => play("move", 7)}>
          move, far right
        </button>
      </div>
      <p aria-live="polite">
        {last}
      </p>
    </main>
  );
}
