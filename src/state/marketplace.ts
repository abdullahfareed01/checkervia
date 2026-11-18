// Sample prices and device-only demo ownership. Real purchases must be
// fulfilled by a payment webhook and verified on the server (D96).
export type CosmeticSlot = "board" | "pieces" | "effect";
export interface Look { board: string; pieces: string; effect: string }
export interface MarketItem {
  id: string;
  name: string;
  category: CosmeticSlot | "bundle";
  description: string;
  price: number;
  tag: string;
  look: Partial<Look>;
}

export const CLASSIC_LOOK: Look = { board: "classic", pieces: "classic", effect: "classic" };
export const MARKET_ITEMS: readonly MarketItem[] = [
  { id: "royal", name: "The Royal Collection", category: "bundle", description: "Midnight marble, gold and ivory pieces, and a polished King finish. A complete signature look.", price: 599, tag: "Signature set", look: { board: "midnight", pieces: "sovereign", effect: "coronation" } },
  { id: "midnight", name: "Midnight Marble", category: "board", description: "Ink blue stone and pale marble, framed in aged brass.", price: 299, tag: "Marble finish", look: { board: "midnight" } },
  { id: "jade", name: "Jade Pavilion", category: "board", description: "Deep forest jade with warm cream squares. A quieter place to think.", price: 299, tag: "Stone finish", look: { board: "jade" } },
  { id: "rosewood", name: "Rosewood Club", category: "board", description: "Rich burgundy wood with honey coloured squares, inspired by a private games room.", price: 299, tag: "Wood finish", look: { board: "rosewood" } },
  { id: "sovereign", name: "Gold & Ivory", category: "pieces", description: "Brushed antique gold against porcelain ivory. Both sides stay easy to tell apart.", price: 249, tag: "Metal & porcelain", look: { pieces: "sovereign" } },
  { id: "sapphire", name: "Sapphire & Pearl", category: "pieces", description: "Deep sapphire discs paired with luminous pearl, with the familiar King crown.", price: 249, tag: "Gemstone finish", look: { pieces: "sapphire" } },
  { id: "copper", name: "Copper & Onyx", category: "pieces", description: "Dark onyx and pale copper with a hand finished metallic sheen.", price: 249, tag: "Foundry finish", look: { pieces: "copper" } },
  { id: "amethyst", name: "Amethyst & Opal", category: "pieces", description: "A rich violet finish for Black and soft opal for White. Your assigned colour chooses your finish; your rival keeps their own pieces.", price: 249, tag: "Crystal finish", look: { pieces: "amethyst" } },
  { id: "silk", name: "Silk Sweep", category: "effect", description: "A satin ribbon follows your piece as it moves. Replay it here before choosing. Only your pieces wear the effect.", price: 149, tag: "Satin move trail", look: { effect: "silk" } },
  { id: "coronation", name: "Royal Seal", category: "effect", description: "Three small gold seals turn around your moving piece. Your Kings also wear an engraved double ring.", price: 149, tag: "Gold move flourish", look: { effect: "coronation" } },
  { id: "comet", name: "Sapphire Comet", category: "effect", description: "A crisp blue comet tail follows your move and fades at the landing. A brief flourish that leaves the board clear.", price: 149, tag: "Comet move trail", look: { effect: "comet" } },
  { id: "petal", name: "Petal Drift", category: "effect", description: "Three rose petals lift from your moving piece and gently drift away. Light on the board and on your device.", price: 149, tag: "Petal move flourish", look: { effect: "petal" } },
  { id: "ember", name: "Copper Arc", category: "effect", description: "A copper arc sweeps around your piece with three tiny sparks. It plays on your moves and settles away.", price: 149, tag: "Copper move flourish", look: { effect: "ember" } },
  { id: "classic-board", name: "Original Board", category: "board", description: "Your free board from Settings. Keep every familiar finish available.", price: 0, tag: "Included", look: { board: "classic" } },
  { id: "classic-pieces", name: "Original Pieces", category: "pieces", description: "Your free black and white pieces, using the style chosen in Settings.", price: 0, tag: "Included", look: { pieces: "classic" } },
  { id: "classic-effect", name: "Quiet Play", category: "effect", description: "The original game effects, with no extra decoration.", price: 0, tag: "Included", look: { effect: "classic" } },
];

export interface Collection { owned: string[]; equipped: Look }
export const MARKET_KEY = "checkervia.marketplace.demo.v1";
const included = MARKET_ITEMS.filter((item) => item.price === 0).map((item) => item.id);
export const emptyCollection = (): Collection => ({ owned: [...included], equipped: { ...CLASSIC_LOOK } });
export function isEquipped(item: MarketItem, look: Look): boolean {
  return Object.entries(item.look).every(([slot, value]) => look[slot as CosmeticSlot] === value);
}

function withBundleContents(owned: string[]): string[] {
  const bundles = MARKET_ITEMS.filter((item) => item.category === "bundle" && owned.includes(item.id));
  const contents = MARKET_ITEMS.filter((item) => item.category !== "bundle" && bundles.some((bundle) => Object.entries(item.look).every(([slot, value]) => bundle.look[slot as CosmeticSlot] === value)));
  return [...new Set([...owned, ...contents.map((item) => item.id)])];
}

export function parseCollection(text: string | null): Collection {
  const fallback = emptyCollection();
  try {
    const data: unknown = JSON.parse(text ?? "null");
    if (!data || typeof data !== "object") return fallback;
    const raw = data as { owned?: unknown; equipped?: unknown };
    const savedOwned: unknown[] = Array.isArray(raw.owned) ? raw.owned : [];
    const owned = withBundleContents([...new Set([...included, ...savedOwned.filter((id): id is string => typeof id === "string" && MARKET_ITEMS.some((item) => item.id === id))])]);
    const equipped = { ...CLASSIC_LOOK };
    if (raw.equipped && typeof raw.equipped === "object") {
      for (const slot of Object.keys(equipped) as CosmeticSlot[]) {
        const value = (raw.equipped as Record<string, unknown>)[slot];
        if (typeof value === "string" && MARKET_ITEMS.some((item) => owned.includes(item.id) && item.look[slot] === value)) equipped[slot] = value;
      }
    }
    return { owned, equipped };
  } catch { return fallback; }
}

export interface CollectionStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function createCollectionStore(storage: CollectionStorage | null, storageKey = MARKET_KEY) {
  let current = emptyCollection();
  try { current = parseCollection(storage?.getItem(storageKey) ?? null); } catch { /* Memory still works. */ }
  const listeners = new Set<() => void>();
  function commit(next: Collection) {
    current = next;
    try { storage?.setItem(storageKey, JSON.stringify(next)); } catch { /* Memory still works. */ }
    listeners.forEach((listener) => listener());
  }
  return {
    get: () => current,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    addDemo(id: string) {
      if (!MARKET_ITEMS.some((item) => item.id === id) || current.owned.includes(id)) return;
      commit({ ...current, owned: withBundleContents([...current.owned, id]) });
    },
    equip(id: string) {
      const item = MARKET_ITEMS.find((entry) => entry.id === id);
      if (!item || !current.owned.includes(id)) return;
      commit({ ...current, equipped: { ...current.equipped, ...item.look } });
    },
  };
}
