import { useEffect, useRef } from "react";

// The contact for the notices and, once the leaderboard opens, removal requests.
export const CONTACT_EMAIL = "checkvia.games@gmail.com";

// The Terms and notices, in plain words. DRAFT text (D45): the owner should
// have it reviewed; it is not legal advice. Same text as
// docs/02-design/terms-and-notices.md. No hyphens or dashes anywhere.
// `soon`: the section describes a feature that does not exist yet.
export const TERMS_SECTIONS: readonly { title: string; soon?: boolean; points: readonly string[] }[] = [
  {
    title: "Entertainment only",
    points: ["Checkervia is a free checkers game made for fun. Nothing in it is advice of any kind."],
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
      "To join, you will choose a username. Usernames are public and unique, and there is no tag. Please do not use your real name. Usernames are filtered, and names or entries that break these rules may be hidden or removed.",
      "Only wins against the AI will count, and our server will check each one by replaying all of its moves. Two player games and resigned games never count.",
      "Your profile will show your games played, wins, losses and win rate. Wins are checked by replay. Games played and losses are reported by the game in your browser and are not checked by replay.",
      "Our server will store your username, your flag, the level, moves and stats of each win you submit, the results of your finished games against the AI, and the dates. It will also store scrambled (hashed) forms of a secret key and a random device id kept in your browser, and of your IP address. It will never store your raw IP address, your age or your email.",
      "Your flag will be suggested from the country your connection comes from. You can change it or choose No flag.",
      "The scrambled device id and IP address are used only to limit how often requests can be made. They are never shown.",
      "Your profile belongs to the secret key kept in this browser. Clearing your browser data loses the profile, and its username stays taken.",
      `To have a profile or an entry removed, you will be able to email ${CONTACT_EMAIL} with the username and roughly when you submitted it.`,
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
