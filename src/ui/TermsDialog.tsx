import { useEffect, useId, useRef, useState } from "react";
import { DocumentIcon } from "./icons";
import { CloseIcon } from "./leaderboard/lbIcons";

// The contact for the notices and, once the leaderboard opens, removal requests.
export const CONTACT_EMAIL = "checkvia.games@gmail.com";

// The Terms and notices, in plain words. DRAFT text (D45): the owner should
// have it reviewed; it is not legal advice. Same text as
// docs/02-design/terms-and-notices.md. No hyphens or dashes anywhere.
export const TERMS_SECTIONS: readonly { title: string; points: readonly string[] }[] = [
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
      "In your browser: your chosen level, your settings, your acceptance of the Strongest notice (the time and the notice version), your totals against the AI (games, wins, losses, draws and resignations), which the AI uses to tease you and, for the leaderboard, a random device id, your profile's secret key, any win that could not be sent yet (kept for at most 7 days) and the code of the online room you are in (so a reload takes you back to it). Clearing your browser data removes them.",
      "In this tab only: your wins and losses against the AI, so it can greet you. They are gone when you close the tab.",
      "During a game, the board and the list of possible moves are sent to the AI provider so the AI can choose its move. No personal details are sent.",
      "On our server: only what the sections below list. Your profile, your results and your online rooms are stored only once you choose a username.",
    ],
  },
  {
    // The leaderboard (D56, D57; automatic wins, renames and avatars D61, D62).
    title: "Leaderboard",
    points: [
      "Before your first game against the AI you make a profile: a username, an avatar and a flag. Usernames are public and unique, and there is no tag. Please do not use your real name. Usernames are filtered, and names or entries that break these rules may be hidden or removed.",
      "Your username, avatar, flag and wins are public on the leaderboard.",
      "When you win a game against the AI, the win is submitted automatically after the result appears. Our server checks each one by replaying all of its moves. A win when the AI resigns counts only when the server proves the AI had a forced loss. Two player games, draws, games you resign and games the AI wins never count. If the win cannot be sent (for example while you are offline), it is kept in your browser for up to 7 days and sent by itself later.",
      "Your profile shows your games played, wins, losses, draws and win rate. Wins are checked by replay. Games played, losses and draws are reported by the game in your browser and are not checked by replay. The AI's record in the game adds up the reported games of every player: totals only, never names.",
      "If you leave a game against the AI without moving for a minute, the game is abandoned and the AI reports you. The fourth report suspends your account for 30 days: no games against the AI until then (two players and Learn stay open), and the count starts again. Our server stores each report (the game, its level, whether it came before your first move, and the time) and your suspension, and your browser keeps the same. Only you see your reports, in your own profile. Questions about a suspension: checkervia.games@gmail.com.",
      "Our server stores your username, your avatar (only which picture you chose), your flag, the level, moves and stats of each win, the results of your finished games against the AI (a win, a loss, a draw, or a loss by resignation), the date of your last username change, and the dates. It also stores scrambled (hashed) forms of a secret key and a random device id kept in your browser, and of your IP address. It never stores your raw IP address, your age or your email, unless you choose to save your progress (below).",
      "The avatar groups (male, female, kid, older adult) only help you find a picture. Which group you looked at is never sent or stored.",
      "You choose your flag yourself, or Prefer not to show a flag. It is never guessed from your connection. You can change your flag and your avatar any time.",
      "You can change your username once every 7 days. Your old username stays reserved for you for 30 days, so nobody else can take it; after that it is free again. Your wins and stats stay with you.",
      "The scrambled device id and IP address are used only to limit how often requests can be made. They are never shown.",
      "Your profile belongs to the secret key kept in this browser. Clearing your browser data loses the profile, and its username stays taken, unless you saved your progress to your email.",
      "Anyone can view the leaderboard and the profiles on it, without choosing a username.",
      `To have a profile or an entry removed, email ${CONTACT_EMAIL} with the username and roughly when you submitted it.`,
    ],
  },
  {
    // Online rooms with a friend (D140 to D143).
    title: "Online play with a friend",
    points: [
      "Playing online with a friend needs a profile. Your friend sees your username, avatar and flag, and whether you are online or away. They see nothing else about you.",
      "Each room has a 6 character code. Anyone who has the code can take the free seat while the room waits, so share it only with your friend. A room holds two players, and nobody can watch.",
      "Our server checks every move with the game's rules, decides the colours (at random in the first game, swapped in each rematch), whose turn it is and when a game is drawn, with the same draw rules as every game. Online games never count on the leaderboard, in your profile's counts or in the AI's record.",
      "If you lose your connection or close the game during a game, your friend sees a 60 second countdown after about 12 seconds. Come back in time and the game goes on. If not, your friend wins by forfeit. Leaving the room during a game loses it.",
      "Our server stores each room (its code, who made it, a scrambled form of the maker's device id, and when it was made and last used), its two players (the username, avatar and flag as they were when each joined, and when we last heard from each), and each game (the colours, every move, and how it ended). A room nobody uses for 24 hours expires, and all of its data is deleted 30 days after its last use.",
      "A device can keep at most 3 rooms with games going. Making a new room closes your other rooms that have no game going.",
    ],
  },
  {
    // Saving progress with an email (D150): optional, never needed to play.
    title: "Saving your progress",
    points: [
      "Saving your progress is optional. If you save it, our server keeps your email address only to send you login codes and to find your profile when you log in on another device. It is never public and never used for marketing.",
      "With a saved profile our server also keeps your shop unlocks and settings, and a scrambled key for each device you log in on.",
      "Login codes are sent through our email provider, Resend. Your email itself is kept by the service that runs our database and sign in. Codes expire after 10 minutes.",
      "You can remove your saved email at any time in your profile. Removing a profile also removes its email and saved data.",
    ],
  },
  {
    // The admin dashboard and moderation (D100 to D102).
    title: "Moderation",
    points: [
      "The owner of Checkervia keeps the leaderboard fair from a private dashboard that only the owner can sign in to, with a password and a second step from an authenticator app. It shows only what our server already stores, as listed here, and never your raw IP address.",
      "Our server also stores when you were last active (the time of your latest game result), which days you played (kept for about 400 days), and, for a suspension, who set it, why, and when it was set or changed. Totals per day (new profiles, games, wins, losses and resignations per level, and per flag) are kept for statistics and hold no names.",
      "A moderator may hide a profile or a win, change a username that breaks the rules, reset an avatar or a flag, suspend an account until a date or for good, stop a device from making a new profile, or remove a profile. While suspended your profile, wins and stats are kept, the game tells you how many days are left, and lifting a suspension restores everything.",
      "Every moderator action is recorded with the time, its reason and the username it was about. This record cannot be changed and is kept after a profile is removed, as proof of what was done. Looking at a profile in the dashboard is recorded too.",
    ],
  },
  {
    title: "Visitor and online counts",
    points: [
      "A device is counted once per UTC day with a scrambled mark that changes daily. Marks older than two days are periodically cleared; daily totals remain.",
      "While a game is visible, an anonymous heartbeat sends its mode, level and your chosen flag every 30 seconds. It expires after 75 seconds and stops when you leave or finish the game. No moves, names or profile keys are sent in these events.",
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
// Strongest notice. The title and the Close button stay put; only the text
// between them scrolls, with a slim gold scroll bar, a gold line at the top
// that fills as you read, and soft fades where more text is hidden. The
// text has the focus, so the arrow keys and Page Down scroll it at once.
// Esc, a click outside or Close returns.
export function TermsDialog({ onClose }: { onClose: () => void }) {
  const ids = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState({ progress: 0, top: true, end: false });

  const measure = () => {
    const box = scrollRef.current;
    if (!box) return;
    const room = box.scrollHeight - box.clientHeight;
    const progress = room > 0 ? Math.min(1, box.scrollTop / room) : 1;
    setRead({ progress, top: box.scrollTop <= 2, end: room - box.scrollTop <= 2 });
  };

  useEffect(() => {
    scrollRef.current?.focus({ preventScroll: true });
    measure();
    // A turned phone or a resized window changes how much is hidden.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        className="dialog terms-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header className="terms-head">
          <span className="terms-mark" aria-hidden="true">
            <DocumentIcon />
          </span>
          <div className="terms-heading">
            <h2 id={`${ids}-title`} className="terms-title">
              Terms and notices
            </h2>
            <p className="terms-subtitle">Please read before you play.</p>
          </div>
          <button type="button" className="terms-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="terms-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${read.progress})` }} />
        </div>
        <div className="terms-body">
          <div
            ref={scrollRef}
            className="terms-scroll gold-scroll"
            tabIndex={0}
            role="region"
            aria-label="Terms text"
            onScroll={measure}
          >
            {TERMS_SECTIONS.map((section, index) => (
              <section key={section.title} className="terms-section">
                <div className="terms-section-head">
                  <span className="terms-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3>{section.title}</h3>
                </div>
                <ul>
                  {section.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <span className={`terms-fade terms-fade-top${read.top ? "" : " terms-fade-on"}`} aria-hidden="true" />
          <span className={`terms-fade terms-fade-end${read.end ? "" : " terms-fade-on"}`} aria-hidden="true" />
        </div>
        <footer className="terms-foot">
          <p className="terms-more" aria-hidden="true">
            {read.end ? "You have reached the end." : "Scroll to read more"}
          </p>
          <button type="button" className="confirm-button confirm-keep terms-done" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
