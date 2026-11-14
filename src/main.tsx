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
import "./ui/motion.css";
import "./ui/settings.css";
import "./ui/leaderboard.css";

async function start() {
  let initial: GameOptions | undefined;

  // Development only: ?scenario=win|lose|duel starts one move from the end.
  // In a production build import.meta.env.DEV is false, so this block and the
  // scenarios file are left out entirely.
  // Also in a "perf" build (vite build --mode perf): production React with
  // the scenarios, for measuring frame times. A normal production build
  // drops all of this (MODE is then "production").
  if (import.meta.env.DEV || import.meta.env.MODE === "perf") {
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
  // Development only: ?lb=populated|long|few|empty|offline|error|limited|slow|new answers
  // the leaderboard in the browser with made up players (devServer.ts).
  if (import.meta.env.DEV) {
    const lb = new URLSearchParams(window.location.search).get("lb");
    if (lb) await (await import("./ui/leaderboard/devServer")).startDevLeaderboard(lb);
    // ?lb=...&form=1: the result panel with the leaderboard form, for a real win.
    if (lb && new URLSearchParams(window.location.search).has("form")) {
      const { DevResultPreview } = await import("./ui/leaderboard/DevResultPreview");
      createRoot(document.getElementById("root")!).render(<DevResultPreview />);
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
