import { useEffect, useRef } from "react";

// What the 18+ badge explains (Change 4): the language rules in two
// sentences, and the way to the Terms and notices. No dashes.
export const LANGUAGE_RULES =
  "At Strongest the AI may insult your play, and it may use mild swearing only right after a mistake the game engine has verified. Slurs, hate, sexual content, remarks about real world traits, family or identity, and threats are blocked at every level.";

export function LanguageInfo({ onTerms, onClose }: { onTerms: () => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        className="dialog language-info"
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-info-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2 id="language-info-title" className="dialog-title">
          18+ · Strong language
        </h2>
        <p className="consent-text">{LANGUAGE_RULES}</p>
        <button type="button" className="link-button" onClick={onTerms}>
          Terms and notices
        </button>
        <div className="dialog-actions">
          <button ref={closeRef} type="button" className="button button-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
