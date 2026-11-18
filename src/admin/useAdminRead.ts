import { useEffect, useState } from "react";
import { problemText } from "./api";
import { adminCall } from "./session";

export type ReadState<T> = { readonly kind: "loading" } | { readonly kind: "problem"; readonly text: string } | { readonly kind: "ok"; readonly value: T };
/** Discard replies after a filter change, a refresh or leaving the screen. */
export function useAdminRead<T>(operation: string, params: object): readonly [ReadState<T>, () => void] {
  const [revision, setRevision] = useState(0);
  const query = JSON.stringify(params);
  const key = `${operation}:${query}:${revision}`;
  const [loaded, setLoaded] = useState<{ key: string; result: ReadState<T> }>();
  useEffect(() => {
    let active = true;
    void adminCall<T>(operation, JSON.parse(query) as Record<string, unknown>).then((answer) => {
      if (active) setLoaded({ key, result: answer.kind === "ok" ? { kind: "ok", value: answer.value } : { kind: "problem", text: problemText(answer) } });
    });
    return () => { active = false; };
  }, [operation, query, key]);
  return [loaded?.key === key ? loaded.result : { kind: "loading" }, () => setRevision((value) => value + 1)];
}
