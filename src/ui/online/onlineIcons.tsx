// The online screens' symbols, drawn for this game in the home menu's line
// style (currentColor, so the gold metal of LbGradients fills them in a
// menu card's well).

/** A globe: online with a friend. */
export function GlobeIcon() {
  return (
    <svg className="icon icon-globe" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.9 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96H10.1c.43-1.43 1.08-2.76 1.9-3.96zM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zM8.03 8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.03 8zM12 19.96A14.1 14.1 0 0 1 10.1 16h3.8A14.1 14.1 0 0 1 12 19.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4h-3.38z"
      />
    </svg>
  );
}

/** A plus in a ring: create a room. */
export function PlusIcon() {
  return (
    <svg className="icon icon-plus" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3v4H7v2h4v4h2v-4h4v-2h-4V7h-2z" />
    </svg>
  );
}

/** A key: join with a code. */
export function KeyIcon() {
  return (
    <svg className="icon icon-key" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7.5 7a5.5 5.5 0 0 1 5.2 3.7H22v3.2h-2.3V17h-3.2v-3.1h-3.8A5.5 5.5 0 1 1 7.5 7zm0 3.2a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6z" />
    </svg>
  );
}

/** Two overlapping sheets: copy. */
export function CopyIcon() {
  return (
    <svg className="icon icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

/** An arrow leaving a box: share. */
export function ShareIcon() {
  return (
    <svg className="icon icon-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3M7.5 7.5 12 3l4.5 4.5" />
      <path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

/** A tick: copied. */
export function TickIcon() {
  return (
    <svg className="icon icon-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
