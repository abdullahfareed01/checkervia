import type { AiStatus } from "../ai";
import type { GameMode } from "../state/gameReducer";
import { CrownIcon, HumanIcon, RobotIcon } from "./icons";
import { Logo } from "./Splash";
import { GameTitle } from "./TopBar";

interface HomeProps {
  aiStatus: AiStatus | "checking";
  onPlay: (mode: GameMode) => void;
  onHowToPlay: () => void;
  onLearn: () => void;
  onRecheck: () => void;
  onTerms: () => void;
}

// What the AI badge says for each health check result.
const AI_BADGES: Record<AiStatus | "checking", { text: string; tone: string }> = {
  ready: { text: "AI online", tone: "ok" },
  checking: { text: "Checking the AI…", tone: "wait" },
  offline: { text: "AI not set up", tone: "warn" },
  unreachable: { text: "AI unreachable", tone: "warn" },
};

// Why the AI cannot be used, in plain words.
const AI_HELP: Partial<Record<AiStatus, string>> = {
  offline: "The server has no API key or model set. Two players still works.",
  unreachable: "The AI service did not answer. Run the game with netlify dev, or try again.",
};

// The home menu: Play vs AI, 2 Players, Learn and How to play.
export function Home({ aiStatus, onPlay, onHowToPlay, onLearn, onRecheck, onTerms }: HomeProps) {
  const badge = AI_BADGES[aiStatus];
  const help = aiStatus === "checking" ? undefined : AI_HELP[aiStatus];

  return (
    <main className="home">
      <header className="home-head">
        <div className="home-logo">
          <Logo />
        </div>
        <GameTitle text="Checkervia" large />
        <p className="home-tagline">Checkers for two, or against an AI.</p>
      </header>

      <nav className="home-menu" aria-label="Main menu">
        <div className="home-item home-item-ai">
          <button type="button" className="menu-card menu-card-ai" onClick={() => onPlay("vs-ai")}>
            <span className="menu-icon" aria-hidden="true">
              <RobotIcon />
            </span>
            <span className="menu-text">
              <span className="menu-label">Play vs AI</span>
              <span className="menu-hint">You play Black. The AI plays White.</span>
            </span>
            <span className={`ai-badge ai-badge-${badge.tone}`}>{badge.text}</span>
          </button>
          {help && (
            <p className="home-help">
              {help}{" "}
              <button type="button" className="link-button" onClick={onRecheck}>
                Check again
              </button>
            </p>
          )}
        </div>

        <button type="button" className="menu-card" onClick={() => onPlay("two-player")}>
          <span className="menu-icon" aria-hidden="true">
            <HumanIcon />
          </span>
          <span className="menu-text">
            <span className="menu-label">2 Players</span>
            <span className="menu-hint">Two people take turns on one screen.</span>
          </span>
        </button>

        <button type="button" className="menu-card menu-card-learn" onClick={onLearn}>
          <span className="menu-icon" aria-hidden="true">
            <RobotIcon />
          </span>
          <span className="menu-text">
            <span className="menu-label">Learn</span>
            <span className="menu-hint">Watch two robots play out every rule.</span>
          </span>
        </button>

        <button type="button" className="menu-card" onClick={onHowToPlay}>
          <span className="menu-icon" aria-hidden="true">
            <CrownIcon />
          </span>
          <span className="menu-text">
            <span className="menu-label">How to play</span>
            <span className="menu-hint">The rules in two minutes.</span>
          </span>
        </button>
      </nav>

      <footer className="home-foot">
        <button type="button" className="link-button" onClick={onTerms}>
          Terms and notices
        </button>
      </footer>
    </main>
  );
}
