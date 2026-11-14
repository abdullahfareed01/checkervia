// The rows of one tab (level and period), page by page. Switching the tab
// starts again from the first page; an answer for an old tab is dropped.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiLevel } from "../../ai/difficulty";
import type { Period } from "../../leaderboard/periods";
import type { LeaderboardResponse, LeaderboardRow } from "../../leaderboard/protocol";
import { leaderboardApi } from "./api";
import { problemOf } from "./Problem";
import type { Problem } from "./Problem";

export type BoardState =
  | { readonly kind: "loading" }
  | { readonly kind: "problem"; readonly problem: Problem }
  | {
      readonly kind: "ready";
      readonly rows: readonly LeaderboardRow[];
      readonly total: number;
      readonly me: LeaderboardRow | null;
      readonly resetsAt: string | null;
      readonly page: number;
      readonly more: "idle" | "loading" | Problem; // Load more, or why it failed
    };

export function useLeaderboardPage(level: AiLevel, period: Period) {
  const [state, setState] = useState<BoardState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const tab = useRef(0);

  useEffect(() => {
    const id = ++tab.current;
    const controller = new AbortController();
    setState({ kind: "loading" });
    leaderboardApi
      .leaderboard(level, period, 0, controller.signal)
      .then((result) => {
        if (id !== tab.current) return;
        setState(result.kind === "ok" ? ready(result.value, result.value.rows) : { kind: "problem", problem: problemOf(result) });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [level, period, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const loadMore = useCallback(async () => {
    if (state.kind !== "ready" || state.more === "loading") return;
    const id = tab.current;
    setState({ ...state, more: "loading" });
    const result = await leaderboardApi.leaderboard(level, period, state.page + 1).catch(() => ({ kind: "offline" }) as const);
    if (id !== tab.current) return;
    setState(result.kind === "ok" ? ready(result.value, [...state.rows, ...result.value.rows]) : { ...state, more: problemOf(result) });
  }, [state, level, period]);

  return { state, retry, loadMore };
}

function ready(response: LeaderboardResponse, rows: readonly LeaderboardRow[]): BoardState {
  return { kind: "ready", rows, total: response.total, me: response.me, resetsAt: response.resetsAt, page: response.page, more: "idle" };
}
