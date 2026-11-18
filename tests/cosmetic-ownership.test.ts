import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialBoard } from "../src/engine";
import { boardAppearance, localAppearance, ownedLook } from "../src/state/cosmeticAppearance";
import { CLASSIC_LOOK, MARKET_ITEMS, createCollectionStore, emptyCollection } from "../src/state/marketplace";
import { Board } from "../src/ui/Board";
import { ShopPreview } from "../src/ui/Marketplace";
import { profileCollectionKey } from "../src/ui/useMarketplace";

function buyer() {
  const store = createCollectionStore(null);
  store.addDemo("royal"); store.equip("royal");
  return store.get();
}
describe.each(["black", "white"] as const)("cosmetics owned by %s", (side) => {
  const other = side === "black" ? "white" : "black";
  it("styles only the owning side; its friend retains original pieces and effects", () => {
    const appearance = localAppearance(buyer(), side);
    expect(appearance.sides[side]).toEqual({ pieces: "sovereign", effect: "coronation" });
    expect(appearance.sides[other]).toEqual({ pieces: "classic", effect: "classic" });
  });
  it("keeps the same piece ownership in both views while boards remain personal", () => {
    const owned = buyer(), original = emptyCollection();
    const players = side === "black" ? { black: owned, white: original } : { black: original, white: owned };
    const mine = boardAppearance(side, players), theirs = boardAppearance(other, players);
    expect(mine.board).toBe("midnight"); expect(theirs.board).toBe("classic");
    expect(mine.sides).toEqual(theirs.sides);
    expect(original.owned).not.toContain("royal");
    expect(original.equipped).toEqual(CLASSIC_LOOK);
  });
  it("marks actual pieces with their own side finish, including a flipped board", () => {
    const html = renderToStaticMarkup(createElement(Board, {
      appearance: localAppearance(buyer(), side), onSquareClick() {},
      view: { board: initialBoard(), selected: null, selectable: [], mustCapture: [], destinations: [], routeChoices: [], lastMove: null, locked: true, flipped: side === "white" },
    }));
    const pieces = [...html.matchAll(/<div class="piece piece-(black|white)" data-piece-finish="([^"]+)" data-piece-effect="([^"]+)"/g)];
    expect(pieces).toHaveLength(24);
    for (const [, player, finish, effect] of pieces) {
      expect(finish).toBe(player === side ? "sovereign" : "classic");
      expect(effect).toBe(player === side ? "coronation" : "classic");
    }
  });
  it("shows the owner's colour variant in the friend's preview, without recolouring the friend", () => {
    const html = renderToStaticMarkup(createElement(ShopPreview, { look: buyer().equipped, owner: side, friend: true, large: true }));
    expect(html).toContain('data-shop-board="classic"');
    expect(html).toContain(`data-preview-flipped="${side === "black"}"`);
    const pieces = [...html.matchAll(/class="piece piece-(black|white)(?: piece-king)?" data-piece-finish="([^"]+)"/g)];
    expect(pieces).toHaveLength(8);
    for (const [, player, finish] of pieces) expect(finish).toBe(player === side ? "sovereign" : "classic");
  });
  it("turns the buyer's preview toward their assigned colour", () => {
    const html = renderToStaticMarkup(createElement(ShopPreview, { look: buyer().equipped, owner: side, friend: false }));
    expect(html).toContain(`data-preview-flipped="${side === "white"}"`);
  });
});
describe("inventory boundaries", () => {
  it("supports two owners without mixing either inventory or loadout", () => {
    const alice = buyer(), bob = createCollectionStore(null);
    bob.addDemo("sapphire"); bob.equip("sapphire"); bob.addDemo("petal"); bob.equip("petal");
    const result = boardAppearance("white", { black: alice, white: bob.get() });
    expect(result.sides.black).toEqual({ pieces: "sovereign", effect: "coronation" });
    expect(result.sides.white).toEqual({ pieces: "sapphire", effect: "petal" });
    expect(bob.get().owned).not.toContain("sovereign");
    expect(alice.owned).not.toContain("sapphire");
    expect(result.board).toBe("classic");
  });
  it("ignores equipped cosmetics that this inventory never unlocked", () => {
    expect(ownedLook({ ...emptyCollection(), equipped: { board: "midnight", pieces: "amethyst", effect: "comet" } })).toEqual(CLASSIC_LOOK);
  });
  it("rejects unknown finish IDs instead of passing them to the renderer", () => {
    expect(ownedLook({ owned: ["forged"], equipped: { board: "forged", pieces: "forged", effect: "forged" } })).toEqual(CLASSIC_LOOK);
  });
  it("keeps two inventories separate even when they share browser storage", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const alice = createCollectionStore(storage, "owner-alice"), bob = createCollectionStore(storage, "owner-bob");
    alice.addDemo("amethyst"); alice.equip("amethyst"); bob.equip("amethyst");
    expect(bob.get()).toEqual(emptyCollection());
    expect(createCollectionStore(storage, "owner-alice").get().equipped.pieces).toBe("amethyst");
    expect(createCollectionStore(storage, "owner-bob").get().owned).not.toContain("amethyst");
  });
  it("derives stable, different profile namespaces without storing their bearer tokens", async () => {
    const one = await profileCollectionKey("a".repeat(43)), two = await profileCollectionKey("b".repeat(43));
    expect(one).toBe(await profileCollectionKey("a".repeat(43)));
    expect(one).not.toBe(two);
    expect(one).not.toContain("a".repeat(43));
  });
  it("provides individually unlockable paired finishes and more move effects", () => {
    for (const id of ["amethyst", "comet", "petal", "ember"]) {
      const store = createCollectionStore(null); store.equip(id);
      expect(store.get().equipped).toEqual(CLASSIC_LOOK);
      store.addDemo(id); store.equip(id);
      const item = MARKET_ITEMS.find((entry) => entry.id === id)!;
      expect(store.get().equipped).toEqual({ ...CLASSIC_LOOK, ...item.look });
    }
  });
});
