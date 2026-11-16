import { useEffect, useRef } from "react";

// What the 18+ badge explains (Change 4): the language rules in two
// sentences, and the way to the Terms and notices. No dashes.
export const LANGUAGE_RULES =
  "At Strongest the AI may insult your play, and it may use mild swearing only right after a mistake the game engine has verified. Slurs, hate, sexual content, remarks about real world traits, family or identity, and threats are blocked at every level.";

export function LanguageInfo({ onTerms, onClose }: { onTerms: () => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  // The game's leather popup (sheet.css, as the "are you sure?" and the
  // conduct popups): the 18+ mark in a dark well, the title, the rules in
  // quieter words, a gold link to the Terms and one gold Close.
  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        className="dialog confirm-dialog language-info"
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-info-title"
        aria-describedby="language-info-text"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <span className="confirm-mark language-info-mark" aria-hidden="true">
          18+
        </span>
        <h2 id="language-info-title" className="confirm-question language-info-title">
          <span className="sr-only">18+ </span>Strong language
        </h2>
        <p id="language-info-text" className="language-info-text">
          {LANGUAGE_RULES}
        </p>
        <button type="button" className="language-info-terms" onClick={onTerms}>
          Terms and notices
        </button>
        <div className="confirm-actions language-info-actions">
          <button ref={closeRef} type="button" className="confirm-button confirm-keep" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
