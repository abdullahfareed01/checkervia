import { useEffect, useState, useSyncExternalStore } from "react";
import { MARKET_KEY, createCollectionStore } from "../state/marketplace";
import { useLeaderboardProfile } from "./leaderboard/profile";

const stores = new Map<string, ReturnType<typeof createCollectionStore>>();
const ownerKeys = new Map<string, string>();
let ephemeralOwner = 0;

// Stable across renames without writing the bearer token into another key.
// This namespaces demo data; it is never proof of paid ownership.
export async function profileCollectionKey(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const digest = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${MARKET_KEY}.profile.${digest}`;
}

function collectionStore(key: string) {
  let store = stores.get(key);
  if (!store) {
    let storage: Storage | null = null;
    try { if (typeof window !== "undefined" && !key.startsWith("memory:")) storage = window.localStorage; } catch { /* Private browsing. */ }
    store = createCollectionStore(storage, key);
    stores.set(key, store);
  }
  return store;
}

function useCollectionKey() {
  const token = useLeaderboardProfile().profile?.token ?? null;
  const [resolved, setResolved] = useState<{ token: string | null; key: string | null }>(() => ({ token, key: token ? ownerKeys.get(token) ?? null : MARKET_KEY }));
  useEffect(() => {
    let cancelled = false;
    if (!token) { setResolved({ token, key: MARKET_KEY }); return; }
    const known = ownerKeys.get(token);
    if (known) { setResolved({ token, key: known }); return; }
    void profileCollectionKey(token).catch(() => `memory:profile:${++ephemeralOwner}`).then((key) => {
      const stableKey = ownerKeys.get(token) ?? key;
      ownerKeys.set(token, stableKey);
      if (!cancelled) setResolved({ token, key: stableKey });
    });
    return () => { cancelled = true; };
  }, [token]);
  // A new account never sees the previous person's collection while loading.
  return resolved.token === token ? resolved.key : token ? ownerKeys.get(token) ?? null : MARKET_KEY;
}

/** The collection store of a profile, by its token (D150: restoring a saved collection). */
export async function collectionStoreFor(token: string) {
  const key = ownerKeys.get(token) ?? (await profileCollectionKey(token));
  ownerKeys.set(token, key);
  return collectionStore(key);
}

export function useMarketplace() {
  const key = useCollectionKey();
  const store = collectionStore(key ?? "memory:pending");
  const collection = useSyncExternalStore(store.subscribe, store.get, store.get);
  return { collection, store, ready: key !== null, key };
}
export function useCollection() { return useMarketplace().collection; }
export function useCosmeticLook() {
  const { equipped } = useCollection();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.shopBoard = equipped.board;
    delete root.dataset.shopPieces;
    delete root.dataset.shopEffect;
  }, [equipped]);
}
