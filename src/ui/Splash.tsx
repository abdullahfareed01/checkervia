// The splash screen (D51, after mockup/splash_screen_mockup.png). index.html
// contains the same markup at its first step, so the splash shows while the
// JavaScript is still downloading; React then renders this component in its
// place, one step further. Its styles live in index.html for the same reason.
import { Scenery } from "./art";

// The Checkervia logo: a cream piece behind a gold rimmed king, with three
// gold sparkles (public/art/logo.svg).
export function Logo() {
  return <img className="logo" src="/art/logo.svg" alt="" />;
}

// The steps the bar shows. Each one is real work: the static page while the
// JavaScript downloads, then the AI health check, then done. No timer.
export const SPLASH_STEPS = {
  loading: { value: 30, note: "Loading the game…" }, // index.html only
  checking: { value: 66, note: "Checking the AI…" },
  ready: { value: 100, note: "Ready" },
} as const;

export function Splash({ leaving }: { leaving: boolean }) {
  const step = leaving ? SPLASH_STEPS.ready : SPLASH_STEPS.checking;
  return (
    <div className={`splash${leaving ? " splash-leaving" : ""}`} role="status" aria-live="polite">
      <div className="splash-frame" aria-hidden="true" />
      <Scenery />
      <div className="splash-main">
        <div className="splash-logo">
          <Logo />
        </div>
        <h1 className="splash-title">Checkervia</h1>
        <div className="splash-divider" aria-hidden="true">
          <span />
          <svg className="splash-crown" viewBox="0 0 24 24">
            <path d="M3 18l1.5-10 5 4.5L12 5l2.5 7.5 5-4.5L21 18z" />
            <rect x="3" y="19" width="18" height="2.4" rx="1" />
          </svg>
          <span />
        </div>
        <p className="splash-sub">Checkers</p>
        <div
          className="splash-bar"
          role="progressbar"
          aria-label="Loading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={step.value}
          aria-valuetext={step.note.replace("…", "")}
        >
          <span className="splash-bar-fill" style={{ width: `${step.value}%` }} />
        </div>
        <p className="splash-note">{step.note}</p>
      </div>
    </div>
  );
}
