import { useEffect, useRef } from "react";

// The contact for the notices (and, later, leaderboard entry removals).
export const CONTACT_EMAIL = "checkvia.games@gmail.com";

// The Terms and notices, in plain words. DRAFT text (D45): the owner should
// have it reviewed; it is not legal advice. Same text as
// docs/02-design/terms-and-notices.md. No hyphens or dashes anywhere.
// `soon`: the section describes a feature that does not exist yet.
export const TERMS_SECTIONS: readonly { title: string; soon?: boolean; points: readonly string[] }[] = [
  {
    title: "Entertainment only",
    points: ["Draft is a free checkers game made for fun. Nothing in it is advice of any kind."],
  },
  {
    title: "AI generated text",
    points: [
      "The AI's moves are checked by our game engine, but its words (its reasons and its lines about your play) are written by an AI language model reached through OpenRouter.",
      "Those words can be wrong, odd or unwelcome. We check them with word lists, but a filter cannot catch everything.",
    ],
  },
  {
    title: "Strong language at Strongest",
    points: [
      "Easy, Medium and Hard are kept clean.",
      "At Strongest the AI may insult your play and use mild profanity after you make a mistake. It is part of the game and is not meant seriously.",
      "At every level, slurs, hate, sexual content, remarks about real world traits, family or identity, and threats are blocked.",
    ],
  },
  {
    title: "18 plus: a self declaration",
    points: [
      "Strongest is for adults. You confirm that you are 18 or older yourself; we cannot check it.",
      "We never ask for or store your age. If you are under 18, please play Easy, Medium or Hard.",
    ],
  },
  {
    title: "What is stored",
    points: [
      "In your browser: your chosen level and your acceptance of the Strongest notice (the time and the notice version). Clearing your browser data removes them.",
      "In this tab only: your wins and losses against the AI, so it can greet you. They are gone when you close the tab.",
      "During a game, the board and the list of possible moves are sent to the AI provider so the AI can choose its move. No personal details are sent.",
      "Nothing is stored on our server today.",
    ],
  },
  {
    // Describes the leaderboard (phases 3 and 4), which is not built yet:
    // shown as coming soon until it exists.
    title: "Leaderboard",
    soon: true,
    points: [
      "The worldwide leaderboard is not open yet, and nothing is sent to it. When it opens, these rules will apply:",
      "If you submit a win, your nickname, a short tag and your game stats will be shown publicly. Please do not use your real name. Nicknames will be filtered, and entries that break these rules may be hidden or removed.",
      "Only when you submit a win, our server will store your nickname and tag, the level, the moves of the game, the stats worked out from them, a scrambled (hashed) form of a random device id kept in your browser, and the date.",
      "Your IP address may be used, in a scrambled form, to limit how often wins can be submitted. It will never be shown.",
      `To have an entry removed, you will be able to email ${CONTACT_EMAIL} with the nickname and tag and roughly when you submitted it.`,
    ],
  },
  {
    title: "Contact",
    points: [`Questions about these notices: ${CONTACT_EMAIL}.`],
  },
  {
    title: "No warranty",
    points: ["The game is provided as it is, without any warranty. It may change, stop working or go offline at any time."],
  },
];

// The Terms and notices sheet: from the Menu, the home screen and the
// Strongest notice. Esc, a click outside or Close returns.
export function TermsDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        className="dialog rules-dialog terms-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2 id="terms-title" className="dialog-title">
          Terms and notices
        </h2>
        {TERMS_SECTIONS.map((section) => (
          <section key={section.title} className="rules-dialog-section">
            <h3>
              {section.title}
              {section.soon && <span className="terms-soon">Coming soon</span>}
            </h3>
            <ul>
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}
        <div className="dialog-actions">
          <button ref={closeRef} type="button" className="button button-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
