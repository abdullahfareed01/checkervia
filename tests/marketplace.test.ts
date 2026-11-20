import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CLASSIC_LOOK, MARKET_ITEMS, MARKET_KEY, createCollectionStore, isEquipped, parseCollection } from "../src/state/marketplace";
import { Marketplace, ShopPreview } from "../src/ui/Marketplace";

describe("marketplace demo collection", () => {
  it("never equips locked or unknown items and never changes the original snapshot", () => {
    const store = createCollectionStore(null);
    const before = store.get();
    store.equip("royal");
    store.addDemo("unknown");
    expect(store.get()).toBe(before);
    store.addDemo("royal");
    store.equip("royal");
    expect(before.equipped).toEqual(CLASSIC_LOOK);
    expect(before.owned).not.toContain("royal");
    expect(store.get().equipped).toEqual({ board: "midnight", pieces: "sovereign", effect: "coronation" });
    expect(store.get().owned).toEqual(expect.arrayContaining(["royal", "midnight", "sovereign", "coronation"]));
    expect(isEquipped(MARKET_ITEMS[0]!, store.get().equipped)).toBe(true);
  });
  it("equips individual slots without removing the other finishes and can restore each free original", () => {
    const store = createCollectionStore(null);
    store.addDemo("royal"); store.equip("royal");
    store.addDemo("jade"); store.equip("jade");
    expect(store.get().equipped).toEqual({ board: "jade", pieces: "sovereign", effect: "coronation" });
    for (const id of ["classic-board", "classic-pieces", "classic-effect"]) store.equip(id);
    expect(store.get().equipped).toEqual(CLASSIC_LOOK);
  });
  it("saves and restores a demo collection without duplicating unlocks", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const store = createCollectionStore(storage);
    store.addDemo("jade"); store.addDemo("jade"); store.equip("jade");
    expect(store.get().owned.filter((id) => id === "jade")).toHaveLength(1);
    expect(createCollectionStore(storage).get()).toEqual(store.get());
    expect(data.has(MARKET_KEY)).toBe(true);
  });
  it.each([null, "broken", "[]", '{"owned":["unknown"],"equipped":{"board":"midnight","pieces":{},"effect":"unknown"}}'])("rejects corrupt or unavailable stored finishes: %s", (raw) => {
    expect(parseCollection(raw).equipped).toEqual(CLASSIC_LOOK);
    expect(parseCollection(raw).owned).toEqual(["classic-board", "classic-pieces", "classic-effect"]);
  });
  it("keeps working in memory when storage reads and writes fail", () => {
    const store = createCollectionStore({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } });
    let changes = 0;
    const unsubscribe = store.subscribe(() => { changes++; });
    store.addDemo("sapphire"); store.equip("sapphire"); unsubscribe(); store.equip("classic-pieces");
    expect(changes).toBe(2);
    expect(store.get().equipped.pieces).toBe("classic");
  });
});
describe("marketplace presentation", () => {
  it("clearly identifies sample prices and free demo unlocks in an accessible full screen dialog", () => {
    const html = renderToStaticMarkup(createElement(Marketplace, { onClose() {} }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Real purchases are not enabled");
    expect(html).toContain("Try demo unlock");
    expect(html).toContain("Sample USD price");
    expect(html).toContain("My collection");
    expect(html).toContain("Pause live previews");
    expect(html).toContain("More details");
    expect(html).not.toContain('<details class="shop-more-details" open');
    const visible = [...html.matchAll(/>([^<]+)</g)].map((m) => m[1]).join(" ");
    expect(visible).not.toMatch(/[-\u2010-\u2015\u2212]/);
  });
  it("previews both sides and keeps King crowns visible", () => {
    const html = renderToStaticMarkup(createElement(ShopPreview, { look: { board: "jade", pieces: "sapphire", effect: "silk" } }));
    expect(html).toContain('data-shop-board="jade"');
    expect(html.match(/class="shop-square /g)).toHaveLength(64);
    expect(html).toContain("piece-black piece-king");
    expect(html).toContain("piece-white piece-king");
  });
  it("prepares an automatic move in the large preview without a replay click", () => {
    const html = renderToStaticMarkup(createElement(ShopPreview, { look: { board: "classic", pieces: "sapphire", effect: "silk" }, large: true, autoPlay: true }));
    expect(html).toContain('data-preview-auto="true"');
    expect(html.match(/class="shop-square [^"]*shop-preview-mover/g)).toHaveLength(1);
    expect(html).toContain("cosmetic-fx-silk");
  });
  it("keeps a requested replay distinct from autoplay", () => {
    const html = renderToStaticMarkup(createElement(ShopPreview, { look: { board: "classic", pieces: "classic", effect: "comet" }, large: true, autoPlay: true, replaying: true, play: 2 }));
    expect(html).toContain('data-preview-mode="replay"');
    expect(html.match(/class="shop-square [^"]*shop-preview-mover/g)).toHaveLength(1);
  });
  it("marks an explicit one-shot request without enabling autoplay", () => {
    const html = renderToStaticMarkup(createElement(ShopPreview, { look: { board: "classic", pieces: "classic", effect: "silk" }, replaying: true, explicitMotion: true }));
    expect(html).toContain('data-preview-mode="replay"');
    expect(html).toContain('data-preview-explicit="true"');
    expect(html).toContain('data-preview-auto="false"');
  });
});
