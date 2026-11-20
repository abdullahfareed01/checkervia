// Before online play (D142): a connection and a profile. Offline, the calm
// offline panel says so. Without a profile, the Profile screen comes first
// (your friend sees your username, avatar and flag); Save leads on to the
// online choices, Back returns to where the player was.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { leaderboardStore } from "../leaderboard/profile";
import { ProfileScreen } from "../leaderboard/ProfileScreen";
import { ProblemPanel } from "../leaderboard/Problem";

export const ONLINE_OFFLINE_TEXT = "You are offline. Playing with a friend online needs an internet connection.";

const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

type Gate = { kind: "profile" | "offline"; run: () => void } | null;

export function useOnlineGate(onTerms: () => void): [(run: () => void) => void, ReactNode] {
  const [gate, setGate] = useState<Gate>(null);
  const request = useCallback((run: () => void) => {
    if (!isOnline()) setGate({ kind: "offline", run });
    else if (leaderboardStore.get().profile === null) setGate({ kind: "profile", run });
    else run();
  }, []);

  let shown: ReactNode = null;
  if (gate?.kind === "profile") {
    shown = (
      <ProfileScreen
        firstGame
        purpose="online"
        onTerms={onTerms}
        onSaved={() => {
          setGate(null);
          gate.run();
        }}
        onClose={() => setGate(null)}
      />
    );
  } else if (gate?.kind === "offline") {
    shown = (
      <OfflineNotice
        onRetry={() => {
          setGate(null);
          request(gate.run);
        }}
        onClose={() => setGate(null)}
      />
    );
  }
  return [request, shown];
}

function OfflineNotice({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.querySelector("button")?.focus({ preventScroll: true }), []);
  return (
    <div className="result-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="dialog online-offline"
        role="alertdialog"
        aria-modal="true"
        aria-label="You are offline"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <ProblemPanel problem={{ kind: "offline" }} text={ONLINE_OFFLINE_TEXT} onRetry={onRetry} />
        <button type="button" className="button online-offline-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
