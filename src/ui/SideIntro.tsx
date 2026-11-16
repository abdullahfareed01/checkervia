// The colour banner (D81): at the start of every game against the AI, a
// short card over the board says which colour you have and who moves first
// ("You are White. The AI moves first."). It floats over the board (no
// space of its own, so nothing moves), lets taps through, and goes after a
// few seconds or as soon as you play your first move.
import { useEffect, useState } from "react";
import type { Player } from "../engine";
import "./sideIntro.css";

export const SIDE_INTRO_MS = 3_200;

/** The banner's two lines. */
export function sideIntroText(side: Player): { title: string; detail: string } {
  return side === "white"
    ? { title: "You are White.", detail: "The AI moves first." }
    : { title: "You are Black.", detail: "You move first." };
}

interface SideIntroProps {
  side: Player;
  played: boolean; // the player has made a move: the banner goes
}

export function SideIntro({ side, played }: SideIntroProps) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShown(false), SIDE_INTRO_MS);
    return () => clearTimeout(timer);
  }, []);
  const { title, detail } = sideIntroText(side);
  const visible = shown && !played;
  return (
    <div className={`side-intro side-intro-${side}${visible ? "" : " side-intro-gone"}`} role="status" aria-live="polite">
      {visible && (
        <>
          <span className={`disc disc-${side}`} aria-hidden="true" />
          <span className="side-intro-text">
            <strong>{title}</strong> {detail}
          </span>
        </>
      )}
    </div>
  );
}

// Numbers each game: a new number whenever history[0] is a new object.
const numbers = new WeakMap<object, number>();
let next = 0;

/** A number that changes with every new game (for keys). */
export function useGameNumber(start: object): number {
  if (!numbers.has(start)) numbers.set(start, ++next);
  return numbers.get(start)!;
}
