// The splash screen. index.html contains the same markup (first step only),
// so the splash shows while the JavaScript is still downloading. React then
// renders this component in its place and adds the AI check.
// Its styles live in index.html for the same reason.

// The Draft logo: a white and a black piece, the black one crowned.
// Keep in step with the copy in index.html.
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="24" cy="38" r="17" fill="#e9e2d6" stroke="#5bc8ff" strokeWidth="2.5" />
      <circle cx="24" cy="38" r="11" fill="none" stroke="#b9b0a2" strokeWidth="1.5" />
      <circle cx="40" cy="27" r="17" fill="#2a211b" stroke="#ffcf40" strokeWidth="2.5" />
      <circle cx="40" cy="27" r="11" fill="none" stroke="#4a3b30" strokeWidth="1.5" />
      <path d="M32 31l2-8 4 4 2-6 2 6 4-4 2 8z" fill="#ffcf40" />
    </svg>
  );
}

// Every step is real work: "Game loaded" is true once React runs this code,
// and the AI step waits for the health check. There is no timer.
export function Splash({ leaving }: { leaving: boolean }) {
  return (
    <div className={`splash${leaving ? " splash-leaving" : ""}`} role="status" aria-live="polite">
      <div className="splash-logo">
        <Logo />
      </div>
      <h1 className="splash-title">Draft</h1>
      <ul className="splash-steps">
        <li className="splash-step splash-step-done">Game loaded</li>
        <li className={`splash-step${leaving ? " splash-step-done" : ""}`}>Checking the AI…</li>
      </ul>
    </div>
  );
}
