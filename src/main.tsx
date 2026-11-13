import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { GameOptions } from "./state/gameReducer";
import { Root } from "./ui/Root";
import "./ui/styles.css";
import "./ui/aiReason.css";
import "./ui/menu.css";
import "./ui/learn.css";
import "./ui/chrome.css";
import "./ui/sheet.css";
import "./ui/bubble.css";
import "./ui/layout.css";
import "./ui/result.css";

async function start() {
  let initial: GameOptions | undefined;

  // Development only: ?scenario=win|lose|duel starts one move from the end.
  // In a production build import.meta.env.DEV is false, so this block and the
  // scenarios file are left out entirely.
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("scenario");
    if (name) initial = (await import("./ui/devScenarios")).scenario(name);
    // ?sounds: the sound audition page instead of the game.
    if (params.has("sounds")) {
      const { SoundAudition } = await import("./ui/SoundAudition");
      createRoot(document.getElementById("root")!).render(<SoundAudition />);
      return;
    }
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root initial={initial} />
    </StrictMode>,
  );
}

void start();
