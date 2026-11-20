// The "new board" sound once per game of the room (the first and each rematch).
import { useEffect, useRef } from "react";
import { playFeedback } from "../feedback";

export function useGameStartSound(matchNumber: number): void {
  const played = useRef(0);
  useEffect(() => {
    if (matchNumber > played.current) playFeedback("gameStart");
    played.current = Math.max(played.current, matchNumber);
  }, [matchNumber]);
}
