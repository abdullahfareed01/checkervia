import { useEffect, useState } from "react";

// Phones held sideways only: the two column layout.
export const LANDSCAPE_PHONE = "(orientation: landscape) and (max-height: 599px) and (min-width: 560px)";

// The query's current answer; false where there is no browser (tests).
function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** True while the media query matches; follows rotation and resizing. */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const list = window.matchMedia(query);
    const update = () => setMatch(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return match;
}
