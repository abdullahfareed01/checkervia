import { useCallback, useState } from "react";
import type { AiLevel, AiStatus } from "../ai";
import type { GameMode, GameOptions } from "../state/gameReducer";
import { App } from "./App";
import { useStrongestGate } from "./ConsentDialog";
import { Home } from "./Home";
import { HowToPlay } from "./HowToPlay";
import { LevelDialog } from "./LevelDialog";
import { Learn } from "./Learn";
import { Splash } from "./Splash";
import { TermsDialog } from "./TermsDialog";
import { useAiLevel } from "./useAiLevel";
import { useAiStatus, useSplash } from "./useAiStatus";
import { useInterfaceFeedback } from "./useFeedback";

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
  const splash = useSplash(ai.loaded);
  const [aiLevel, setAiLevel] = useAiLevel();
  const [screen, setScreen] = useState<Screen>(() =>
    initial ? { name: "game", options: initial, id: 0 } : { name: "home" },
  );

  const [askLevel, setAskLevel] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const start = (mode: GameMode, level = aiLevel) =>
    setScreen((current) => ({
      name: "game",
      options: { mode, aiLevel: level },
      id: current.name === "game" ? current.id + 1 : 1,
    }));
  // Playing the AI first asks for its level; two players start at once.
  const play = (mode: GameMode) => (mode === "vs-ai" ? setAskLevel(true) : start(mode));
  const startAt = useCallback(
    (level: AiLevel) => {
      setAiLevel(level);
      start("vs-ai", level);
    },
    [setAiLevel],
  );
  // Strongest asks the 18+ consent first (D45).
  const [requestLevel, consent] = useStrongestGate(startAt);
  const startVsAi = (level: AiLevel) => {
    setAskLevel(false);
    requestLevel(level);
  };
  const home = () => setScreen({ name: "home" });

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
        />
      )}
      {screen.name === "rules" && <HowToPlay onBack={home} onPlay={play} onLearn={() => setScreen({ name: "learn" })} />}
      {screen.name === "learn" && <Learn onMenu={home} />}
      {screen.name === "game" && <App key={screen.id} initial={screen.options} onMenu={home} onAiLevel={setAiLevel} />}
      {askLevel && <LevelDialog initial={aiLevel} onStart={startVsAi} onCancel={() => setAskLevel(false)} />}
      {consent}
      {termsOpen && <TermsDialog onClose={() => setTermsOpen(false)} />}
      {splash !== "gone" && <Splash leaving={splash === "leaving"} />}
    </>
  );
}
