// The first game against the AI on this device (D61): after the existing
// consent steps, and before the board is shown, the player makes a profile.
// - With a profile: the game starts at once (no question again).
// - Online without one: the Profile screen; Save leads on to the game, Back
//   returns to the home screen. There is no Skip.
// - Offline without one: play is never blocked. A short notice says wins are
//   not recorded until a profile exists, and the game starts; the Profile
//   screen comes the next time a game against the AI starts while online.
// Two player games never come here. A suspended account (D85) gets the
// suspension popup here instead of a game: every way into a game against
// the AI comes through this gate.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { GameMode } from "../../state/gameReducer";
import { useSuspendedNotice } from "../ConductDialogs";
import { ProfileScreen } from "./ProfileScreen";
import { leaderboardStore } from "./profile";

export const OFFLINE_FIRST_TITLE = "You are offline";
export const OFFLINE_FIRST_TEXT =
  "Your wins are not recorded until you have a leaderboard profile. You can make one the next time you start a game against the AI while online.";

type Gate = { kind: "profile" | "offline"; run: () => void } | null;

/**
 * What comes between the consent steps and the board of a new game: nothing
 * for two players or with a profile, the Profile screen online, the short
 * notice offline.
 */
export function gateStep(mode: GameMode, hasProfile: boolean, online: boolean): "board" | "profile" | "offline" {
  if (mode !== "vs-ai" || hasProfile) return "board";
  return online ? "profile" : "offline";
}

const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

/**
 * Returns the function that starts a game against the AI through the gate,
 * and what to render for it.
 */
export function useProfileGate(onBack: () => void, onTerms: () => void): [(run: () => void) => void, ReactNode] {
  const [gate, setGate] = useState<Gate>(null);
  const [notifySuspended, suspendedNotice] = useSuspendedNotice();
  const request = useCallback((run: () => void) => {
    if (notifySuspended()) return;
    const step = gateStep("vs-ai", leaderboardStore.get().profile !== null, isOnline());
    if (step === "board") run();
    else setGate({ kind: step, run });
  }, []);

  let shown: ReactNode = null;
  if (gate?.kind === "profile") {
    shown = (
      <ProfileScreen
        firstGame
        onTerms={onTerms}
        onSaved={() => {
          setGate(null);
          gate.run();
        }}
        onClose={() => {
          setGate(null);
          onBack();
        }}
      />
    );
  } else if (gate?.kind === "offline") {
    shown = (
      <OfflineFirstGame
        onContinue={() => {
          setGate(null);
          gate.run();
        }}
        onBack={() => {
          setGate(null);
          onBack();
        }}
      />
    );
  }
  return [request, shown ?? suspendedNotice];
}

function OfflineFirstGame({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) {
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => continueRef.current?.focus(), []);
  return (
    <div className="lb-backdrop pf-offline-backdrop">
      <div
        className="dialog pf-offline"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pf-offline-title"
        aria-describedby="pf-offline-text"
        onKeyDown={(event) => {
          if (event.key === "Escape") onBack();
        }}
      >
        <h2 id="pf-offline-title" className="dialog-title">
          {OFFLINE_FIRST_TITLE}
        </h2>
        <p id="pf-offline-text" className="pf-offline-text">
          {OFFLINE_FIRST_TEXT}
        </p>
        <div className="pf-actions">
          <button type="button" className="lb-button" onClick={onBack}>
            Back
          </button>
          <button ref={continueRef} type="button" className="lb-button lb-button-gold" onClick={onContinue}>
            Continue to the game
          </button>
        </div>
      </div>
    </div>
  );
}
