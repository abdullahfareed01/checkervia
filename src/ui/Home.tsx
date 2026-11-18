import type { ReactNode } from "react";
import type { AiStatus } from "../ai";
import type { GameMode } from "../state/gameReducer";
import { ChevronIcon, CrownIcon, DocumentIcon, GearIcon, GradCapIcon, TwoPlayersIcon } from "./icons";
import { Avatar } from "./leaderboard/Avatar";
import { LbCrown, LbGradients, LbTrophy } from "./leaderboard/lbIcons";
import { useLeaderboardProfile } from "./leaderboard/profile";
import { RobotFace } from "./RobotFace";
import { Logo } from "./Splash";
import { GameTitle } from "./TopBar";
import { ShopIcon } from "./Marketplace";

interface HomeProps {
  aiStatus: AiStatus | "checking";
  onPlay: (mode: GameMode) => void;
  onHowToPlay: () => void;
  onLearn: () => void;
  onRecheck: () => void;
  onTerms: () => void;
  onSettings?: (() => void) | undefined; // sound, haptics, voice, animation, board
  onLeaderboard?: (() => void) | undefined; // D57: open to everyone
  onProfile?: (() => void) | undefined; // D62: the profile icon, top right
  onShop?: (() => void) | undefined;
}

// What the AI badge says for each health check result.
const AI_BADGES: Record<AiStatus | "checking", { text: string; tone: string }> = {
  ready: { text: "AI Online", tone: "ok" },
  checking: { text: "Checking the AI…", tone: "wait" },
  offline: { text: "AI unavailable", tone: "warn" },
  unreachable: { text: "AI unreachable", tone: "warn" },
};

// Why the AI cannot be used, in plain words.
const AI_HELP: Partial<Record<AiStatus, string>> = {
  offline: "The AI is unavailable right now. Try again shortly. Two Players and Learn still work.",
  unreachable: "The AI service did not answer. Run the game with netlify dev, or try again.",
};

interface MenuCardProps {
  icon: ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  className?: string;
  badge?: ReactNode;
}

// One menu card, as in the mockup: the icon in a dark well, a thin gold
// line, the label and its hint, then a chevron (D66).
function MenuCard({ icon, label, hint, onClick, className = "", badge }: MenuCardProps) {
  return (
    <button type="button" className={`menu-card ${className}`} onClick={onClick}>
      <span className="menu-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="menu-divider" aria-hidden="true" />
      <span className="menu-text">
        <span className="menu-label">{label}</span>
        <span className="menu-hint">{hint}</span>
      </span>
      {badge}
      <span className="menu-chevron" aria-hidden="true">
        <ChevronIcon direction="right" />
      </span>
    </button>
  );
}

// The home menu (D66, after the owner's "Refined Checkervia Checkers Menu"
// mockup): a gold rimmed frame with a checkered floor, the logo and title,
// Play vs AI, 2 Players, Learn, the Leaderboard and How to Play, then
// Settings and the Terms.
export function Home({ aiStatus, onPlay, onHowToPlay, onLearn, onRecheck, onTerms, onSettings, onLeaderboard, onProfile, onShop }: HomeProps) {
  const badge = AI_BADGES[aiStatus];
  const help = aiStatus === "checking" ? undefined : AI_HELP[aiStatus];
  const { profile } = useLeaderboardProfile();

  return (
    <main className="home">
      <div className="home-frame">
        <LbGradients />
        <div className="home-scenery" aria-hidden="true" />
        {onShop && <button type="button" className="home-shop" onClick={onShop}><ShopIcon /><span>Shop</span></button>}
        {onProfile && (
          // The player's avatar once a profile exists, a neutral person before.
          <button
            type="button"
            className="home-profile"
            aria-label={profile ? `Your profile, ${profile.username}` : "Create your profile"}
            onClick={onProfile}
          >
            <Avatar id={profile?.avatar ?? null} size={64} />
            <span className="home-profile-badge" aria-hidden="true">
              <CrownIcon />
            </span>
          </button>
        )}
        <header className="home-head">
          <div className="home-logo">
            <Logo />
          </div>
          <GameTitle text="Checkervia" large />
          <p className="home-tagline">Checkers for two, or against an AI.</p>
        </header>

        <nav className="home-menu" aria-label="Main menu">
          <div className="home-item home-item-ai">
            <MenuCard
              className="menu-card-ai"
              icon={<RobotFace mood="neutral" />}
              label="Play vs AI"
              hint="Your colour is random each game. Black moves first."
              onClick={() => onPlay("vs-ai")}
              badge={<span className={`ai-badge ai-badge-${badge.tone}`}>{badge.text}</span>}
            />
            {help && (
              <p className="home-help">
                {help}{" "}
                <button type="button" className="link-button" onClick={onRecheck}>
                  Check again
                </button>
              </p>
            )}
          </div>

          <MenuCard icon={<TwoPlayersIcon />} label="2 Players" hint="Two people take turns on one screen." onClick={() => onPlay("two-player")} />

          <MenuCard className="menu-card-learn" icon={<GradCapIcon />} label="Learn" hint="Watch two robots play out every rule." onClick={onLearn} />

          {onLeaderboard && (
            <MenuCard
              className="menu-card-leaderboard"
              icon={<LbTrophy />}
              label="Leaderboard"
              hint="The best players against the AI, this week and ever."
              onClick={onLeaderboard}
            />
          )}

          <MenuCard icon={<LbCrown jewel="#e9a92c" />} label="How to Play" hint="The rules in two minutes." onClick={onHowToPlay} />
        </nav>

        <footer className="home-foot">
          {onSettings && (
            <>
              <button type="button" className="home-link" onClick={onSettings}>
                <GearIcon />
                <span>Settings</span>
              </button>
              <span className="home-foot-divider" aria-hidden="true" />
            </>
          )}
          <button type="button" className="home-link" onClick={onTerms}>
            <DocumentIcon />
            <span>Terms &amp; Notices</span>
          </button>
        </footer>
      </div>
    </main>
  );
}
