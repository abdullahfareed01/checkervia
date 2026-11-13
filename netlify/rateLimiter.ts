// A best-effort rate limiter that lives in the memory of ONE running function
// instance. See docs/03-technical/ai-opponent.md for what that can and cannot
// protect against: instances do not share memory and restart often, so this
// slows down casual abuse but is not a guarantee.

export interface RateLimiter {
  // True if this client may make a request now. Counts the request if so.
  allow(clientId: string): boolean;
}

interface RateLimiterOptions {
  limit: number; // requests allowed per window, per client
  windowMs: number;
  now?: () => number;
  maxClients?: number; // memory cap: how many clients to remember
}

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxClients = 1000,
}: RateLimiterOptions): RateLimiter {
  // Request times per client. Map order is "least recently seen first".
  const hits = new Map<string, number[]>();

  function recentHits(clientId: string, time: number): number[] {
    return (hits.get(clientId) ?? []).filter((hit) => time - hit < windowMs);
  }

  // Keeps memory bounded: drop clients with no recent requests, then the
  // least recently seen ones if there are still too many.
  function forgetOldClients(time: number): void {
    for (const [clientId, times] of hits) {
      if (times.every((hit) => time - hit >= windowMs)) hits.delete(clientId);
    }
    while (hits.size > maxClients) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
  }

  return {
    allow(clientId) {
      const time = now();
      const recent = recentHits(clientId, time);
      const allowed = recent.length < limit;
      if (allowed) recent.push(time); // refused requests are not counted

      hits.delete(clientId);
      hits.set(clientId, recent);
      forgetOldClients(time);
      return allowed;
    },
  };
}
