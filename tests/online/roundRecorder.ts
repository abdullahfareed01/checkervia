// Records the database rounds of the room functions (D151, D153): every
// store call, and the round it ran in. A round is a set of calls that
// overlap in time; each call waits `ms` real milliseconds first, as a trip
// to the database would.
import type { World } from "./world";

export function recordRounds(w: World, ms = 20) {
  const calls: { name: string; round: number }[] = [];
  let inFlight = 0;
  let round = 0;
  const wrap = <T extends object>(target: T, side: string): T =>
    new Proxy(target, {
      get(object, key) {
        const value = Reflect.get(object, key);
        if (typeof value !== "function") return value;
        return async (...args: unknown[]) => {
          if (inFlight === 0) round += 1;
          inFlight += 1;
          calls.push({ name: `${side}.${String(key)}`, round });
          try {
            await new Promise((resolve) => setTimeout(resolve, ms));
            return await value.apply(object, args);
          } finally {
            inFlight -= 1;
          }
        };
      },
    });
  w.deps = {
    ...w.deps,
    store: wrap(w.deps.store, "store"),
    online: wrap(w.deps.online, "online"),
    ...(w.deps.oneRound ? { oneRound: wrap(w.deps.oneRound, "oneRound") } : {}),
  };
  return {
    reset() {
      calls.length = 0;
      round = 0;
    },
    /** The calls of each round, sorted by name. */
    rounds: () => Array.from({ length: round }, (_, index) => calls.filter((c) => c.round === index + 1).map((c) => c.name).sort()),
    names: () => calls.map((c) => c.name),
  };
}
