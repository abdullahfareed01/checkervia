// The username field's live check (D57). The rules are checked at once on
// every key (the shared module the server also uses). Only a name that
// passes them is sent to the server, after a pause in typing, and each name
// at most once: the answer is remembered. The server limits the check too.
import { useEffect, useRef, useState } from "react";
import { usernameKey, usernameProblems } from "../../leaderboard/username";
import type { UsernameRule } from "../../leaderboard/username";
import { leaderboardApi } from "./api";

export const CHECK_DELAY_MS = 450;

export type Availability = "idle" | "checking" | "available" | "taken" | "offline" | "limited";

export interface UsernameCheck {
  readonly problems: readonly UsernameRule[];
  readonly availability: Availability;
}

export function useUsernameCheck(name: string): UsernameCheck {
  const problems = usernameProblems(name);
  const valid = name.length > 0 && problems.length === 0;
  const key = usernameKey(name);
  const known = useRef(new Map<string, "available" | "taken">());
  const [availability, setAvailability] = useState<Availability>("idle");

  useEffect(() => {
    if (!valid) {
      setAvailability("idle");
      return undefined;
    }
    const remembered = known.current.get(key);
    if (remembered) {
      setAvailability(remembered);
      return undefined;
    }
    setAvailability("checking");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await leaderboardApi.checkUsername(name, controller.signal);
        if (result.kind === "ok") {
          const answer = result.value.available ? "available" : "taken";
          known.current.set(key, answer);
          setAvailability(answer);
        } else setAvailability(result.kind === "failed" && result.status === 429 ? "limited" : "offline");
      } catch {
        // Cancelled: a newer name is being checked.
      }
    }, CHECK_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, valid]);

  return { problems, availability: valid ? availability : "idle" };
}
