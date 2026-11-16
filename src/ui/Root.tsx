import { useCallback, useEffect, useState } from "react";
import type { AiLevel, AiStatus } from "../ai";
import type { GameMode, GameOptions } from "../state/gameReducer";
import { randomSide } from "../state/sides";
import { App } from "./App";
import { useStrongestGate } from "./ConsentDialog";
import { Home } from "./Home";
import { HowToPlay } from "./HowToPlay";
import { LevelDialog } from "./LevelDialog";
import { Learn } from "./Learn";
import { Splash } from "./Splash";
import { TermsDialog } from "./TermsDialog";
import { SettingsSheet } from "./SettingsSheet";
import { useAiLevel } from "./useAiLevel";
import { useAiStatus, useSplash } from "./useAiStatus";
import { useInterfaceFeedback } from "./useFeedback";
import { useSettings } from "./settings";
import { LeaderboardScreen } from "./leaderboard/LeaderboardScreen";
import { useProfileGate } from "./leaderboard/ProfileGate";
import { ProfileScreen } from "./leaderboard/ProfileScreen";
import { leaderboardStore } from "./leaderboard/profile";
import { startQueueRetries } from "./leaderboard/winQueue";

// Which screen is showing. A game gets a fresh `id` each time one is started
// from the menu, so the board always starts clean.
export type Screen =
  | { name: "home" }
  | { name: "rules" }
  | { name: "learn" }
  | { name: "game"; options: GameOptions; id: number };

interface RootProps {
  // Development preview scenarios open straight on the game.
  initial?: GameOptions | undefined;
  // Tests pass a fake health check.
  checkAi?: () => Promise<AiStatus>;
}

// The whole app: splash first (until the AI check is done), then the home
// menu, the rules page or a game.
export function Root({ initial, checkAi }: RootProps) {
  const ai = useAiStatus(checkAi);
  useInterfaceFeedback(); // audio unlock on the first tap, button clicks
  // The animation level and speed (motion.css) and the board options
  // (settings.css), as attributes on <html> for the CSS.
  const settings = useSettings();
  const { animation, board } = settings;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.anim = animation.level;
    root.style.setProperty("--anim-speed", String(animation.speed));
    root.dataset.boardTheme = board.theme;
    root.dataset.pieces = board.pieces;
    root.dataset.coords = board.coordinates;
    root.dataset.legal = board.legalMoves ? "on" : "off";
    root.dataset.lastMove = board.lastMove ? "on" : "off";
  }, [animation.level, animation.speed, board.theme, board.pieces, board.coordinates, board.legalMoves, board.lastMove]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const splash = useSplash(ai.loaded);
  const [aiLevel, setAiLevel] = useAiLevel();
  // A recorded test win (?testwin, D60) without a profile goes through the
  // profile step first, like any game against the AI.
  const gateInitial = initial?.record !== undefined && initial.mode === "vs-ai" && leaderboardStore.get().profile === null;
  const [screen, setScreen] = useState<Screen>(() =>
    initial && !gateInitial ? { name: "game", options: initial, id: 0 } : { name: "home" },
  );

  const [askLevel, setAskLevel] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // Queued wins are sent when the app opens and when the device is back online (D61).
  useEffect(() => startQueueRetries(), []);

  // Against the AI the person gets a random colour for every game (D81).
  const start = (mode: GameMode, level = aiLevel) => {
    const humanSide = randomSide();
    setScreen((current) => ({
      name: "game",
      options: { mode, aiLevel: level, humanSide },
      id: current.name === "game" ? current.id + 1 : 1,
    }));
  };
  // Playing the AI first asks for its level; two players start at once.
  const play = (mode: GameMode) => (mode === "vs-ai" ? setAskLevel(true) : start(mode));
  const startAt = useCallback(
    (level: AiLevel) => {
      setAiLevel(level);
      start("vs-ai", level);
    },
    [setAiLevel],
  );
  const home = () => setScreen({ name: "home" });
  // The first game against the AI asks for a profile, after the consent (D61).
  const [requireProfile, profileGate] = useProfileGate(home, () => setTermsOpen(true));
  const gatedStart = useCallback((level: AiLevel) => requireProfile(() => startAt(level)), [requireProfile, startAt]);
  // Strongest asks the 18+ consent first (D45).
  const [requestLevel, consent] = useStrongestGate(gatedStart);
  useEffect(() => {
    if (gateInitial && initial) requireProfile(() => setScreen({ name: "game", options: initial, id: 0 }));
  }, []);
  const startVsAi = (level: AiLevel) => {
    setAskLevel(false);
    requestLevel(level);
  };

  return (
    <>
      {screen.name === "home" && (
        <Home
          aiStatus={ai.status}
          onPlay={play}
          onHowToPlay={() => setScreen({ name: "rules" })}
          onLearn={() => setScreen({ name: "learn" })}
          onRecheck={ai.recheck}
          onTerms={() => setTermsOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onLeaderboard={() => setLeaderboardOpen(true)}
          onProfile={() => setProfileOpen(true)}
        />
      )}
      {screen.name === "rules" && <HowToPlay onBack={home} onPlay={play} onLearn={() => setScreen({ name: "learn" })} />}
      {screen.name === "learn" && <Learn onMenu={home} />}
      {screen.name === "game" && <App key={screen.id} initial={screen.options} onMenu={home} onAiLevel={setAiLevel} />}
      {askLevel && <LevelDialog initial={aiLevel} onStart={startVsAi} onCancel={() => setAskLevel(false)} />}
      {consent}
      {profileGate}
      {leaderboardOpen && <LeaderboardScreen onClose={() => setLeaderboardOpen(false)} onOwnProfile={() => setProfileOpen(true)} />}
      {profileOpen && <ProfileScreen onClose={() => setProfileOpen(false)} onTerms={() => setTermsOpen(true)} />}
      {termsOpen && <TermsDialog onClose={() => setTermsOpen(false)} />}
      {settingsOpen && (
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          onProfile={() => {
            setSettingsOpen(false);
            setProfileOpen(true);
          }}
        />
      )}
      {splash !== "gone" && <Splash leaving={splash === "leaving"} />}
    </>
  );
}
