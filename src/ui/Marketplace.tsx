import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CLASSIC_LOOK, MARKET_ITEMS, isEquipped } from "../state/marketplace";
import type { Look, MarketItem } from "../state/marketplace";
import { localAppearance } from "../state/cosmeticAppearance";
import type { Player } from "../engine";
import { CosmeticSides } from "./CosmeticAppearance";
import { CrownIcon } from "./icons";
import { CloseIcon } from "./leaderboard/lbIcons";
import { Piece } from "./Piece";
import { useMarketplace } from "./useMarketplace";
import { useSettings } from "./settings";
import { useMediaQuery } from "./useMediaQuery";
import { usePreviewActivity } from "./usePreviewActivity";

export function ShopIcon() {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9v12h16V9M3 9l2-6h14l2 6M3 9c0 4 5 4 5 0 0 4 8 4 8 0 0 4 5 4 5 0M9 21v-7h6v7M8 3v6m8-6v6" /></svg>;
}

export function ShopPreview({ look, large = false, owner = "black", friend = false, play = 0, autoPlay = false, replaying = false, explicitMotion = false, onReplayEnd }: { look: Look; large?: boolean; owner?: Player; friend?: boolean; play?: number; autoPlay?: boolean; replaying?: boolean; explicitMotion?: boolean; onReplayEnd?: () => void }) {
  const appearance = localAppearance({ owned: MARKET_ITEMS.map((item) => item.id), equipped: look }, owner);
  const activity = usePreviewActivity(autoPlay || replaying);
  return (
    <CosmeticSides.Provider value={appearance.sides}>
    <div ref={activity.ref} className={`shop-look${large ? " shop-look-large" : ""}${replaying ? " shop-look-playing" : ""}`} data-preview-mode={replaying ? "replay" : autoPlay ? "auto" : "still"} data-preview-explicit={explicitMotion} data-preview-auto={autoPlay} data-preview-active={activity.active} data-shop-board={friend ? "classic" : look.board} data-preview-owner={owner} data-preview-friend={friend} data-preview-flipped={friend ? owner === "black" : owner === "white"} aria-hidden="true" onAnimationEnd={(event) => { if (event.animationName === "shop-replay-move") onReplayEnd?.(); }}>
      <div key={play} className="shop-preview-board">
        {Array.from({ length: 64 }, (_, i) => {
          const row = Math.floor(i / 8), col = i % 8;
          const player = [8, 10, 12, 21].includes(i) ? "white" : [35, 49, 51, 53].includes(i) ? "black" : null;
          const moving = owner === "black" ? i === 35 : i === 21;
          return <div key={i} className={`shop-square ${(row + col) % 2 ? "shop-square-dark" : "shop-square-light"}${moving && (replaying || autoPlay) ? " shop-preview-mover" : ""}`}>
            {player && <span className="shop-disc-wrap"><Piece piece={{ player, kind: i === 21 || i === 35 ? "king" : "man" }} /></span>}
          </div>;
        })}
      </div>
    </div>
    </CosmeticSides.Provider>
  );
}

const ProductArt = memo(function ProductArt({ item, animate }: { item: MarketItem; animate: boolean }) {
  const activity = usePreviewActivity(animate && item.category === "effect" && item.price > 0);
  if (item.category === "board" || item.category === "bundle") return <ShopPreview look={{ ...CLASSIC_LOOK, ...item.look }} autoPlay={animate && item.category === "bundle"} />;
  const sides = localAppearance({ owned: [item.id], equipped: { ...CLASSIC_LOOK, ...item.look } }, "black").sides;
  return <div ref={activity.ref} className={`shop-asset-display shop-asset-${item.category}`} data-card-live={activity.active} aria-hidden="true">
    <CosmeticSides.Provider value={item.category === "pieces" ? { black: sides.black, white: sides.black } : sides}>
      {item.category === "pieces" ? <><Piece piece={{ player: "black", kind: "man" }} /><Piece piece={{ player: "white", kind: "man" }} /></> : <><span className={`shop-effect-emblem shop-effect-${item.id}`} /><Piece piece={{ player: "black", kind: "king" }} /></>}
    </CosmeticSides.Provider>
  </div>;
});

const FILTERS = [ ["all", "Discover"], ["board", "Boards"], ["pieces", "Pieces"], ["effect", "Effects"], ["bundle", "Bundles"], ["owned", "My collection"] ] as const;
type Filter = typeof FILTERS[number][0];
export const samplePrice = (item: MarketItem) => item.price ? `$${(item.price / 100).toFixed(2)}` : "Included";

export function Marketplace({ onClose }: { onClose: () => void }) {
  const { collection, store, ready, key: collectionKey } = useMarketplace();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(MARKET_ITEMS[0]!);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const [play, setPlay] = useState(0);
  const [owner, setOwner] = useState<Player>("black");
  const [friend, setFriend] = useState(false);
  const [previewsPaused, setPreviewsPaused] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [explicitMotion, setExplicitMotion] = useState(false);
  const [detailFits, setDetailFits] = useState(false);
  const animation = useSettings().animation.level;
  const systemReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const reduced = systemReduced || animation === "off" || animation === "reduced";
  const autoPreview = !reduced && !previewsPaused;
  const panel = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLElement>(null);
  const previewStage = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const title = useId();
  useEffect(() => {
    const inspector = detail.current, content = contentRef.current;
    if (!inspector || !content || typeof ResizeObserver === "undefined") return;
    // A tall inspector must stay in normal flow; pinning it would hide its
    // last controls on short windows or when text is enlarged.
    const update = () => setDetailFits(inspector.offsetHeight <= content.clientHeight - 32);
    const observer = new ResizeObserver(update);
    observer.observe(inspector); observer.observe(content); update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Inert the mounted game as well as trapping focus, so pointer and
    // assistive technology navigation cannot reach the covered board.
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    close.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (root) root.inert = wasInert;
      if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected) previous.focus();
      else document.querySelector<HTMLElement>(".home-shop, .menu > .bar-button")?.focus();
    };
  }, []);
  const owned = collection.owned.includes(selected.id);
  const equipped = isEquipped(selected, collection.equipped);
  const previousConfirmation = useRef(confirming);
  const focusReady = useRef(false);
  useLayoutEffect(() => {
    // A confirmation button disappears after an unlock or cancellation.
    // Keep keyboard focus in the dialog when its controls change.
    if (!focusReady.current) { focusReady.current = true; return; }
    const changed = previousConfirmation.current !== confirming;
    previousConfirmation.current = confirming;
    const active = document.activeElement;
    if (panel.current && (changed || !panel.current.contains(active) || (active instanceof HTMLButtonElement && active.disabled))) {
      if (primary.current && !primary.current.disabled) primary.current.focus({ preventScroll: true });
      else detail.current?.focus({ preventScroll: true });
    }
  }, [confirming, owned, equipped]);
  const preview = { ...collection.equipped, ...selected.look };
  const items = MARKET_ITEMS.filter((item) => filter === "all" ? item.price > 0 : filter === "owned" ? collection.owned.includes(item.id) : item.category === filter);
  function choose(item: MarketItem, scroll = true) {
    setSelected(item); setConfirming(false); setNotice(""); setReplaying(false); setExplicitMotion(false); setPlay((value) => value + 1);
    if (scroll) {
      detail.current?.scrollIntoView({ block: "start" });
      detail.current?.focus({ preventScroll: true });
    }
  }
  function replayPreview() {
    // Bring both the board and its nearby Replay control into view before
    // starting. A manual request must not disappear in the autoplay hold.
    previewStage.current?.scrollIntoView({ block: "nearest" });
    setExplicitMotion(reduced); setReplaying(true); setPlay((value) => value + 1);
  }
  function changeFilter(next: Filter) {
    setFilter(next); setConfirming(false);
    const visible = MARKET_ITEMS.filter((item) => next === "all" ? item.price > 0 : next === "owned" ? collection.owned.includes(item.id) : item.category === next);
    if (!visible.some((item) => item.id === selected.id) && visible[0]) choose(visible[0], false);
  }
  const content = (
    <div ref={panel} className="marketplace gold-scroll" data-collection-scope={collectionKey ?? "loading"} role="dialog" aria-modal="true" aria-labelledby={title} onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); if (confirming) setConfirming(false); else onClose(); }
      if (event.key === "Tab") {
        const controls = [...(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), summary, a[href], [tabindex='0']") ?? [])].filter((control) => control.getClientRects().length > 0);
        const index = controls.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && index === 0) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0]?.focus(); }
      }
    }}>
      <header className="shop-header">
        <div className="shop-brand"><ShopIcon /><div><p className="shop-eyebrow">THE CHECKERVIA ATELIER</p><h1 id={title}>Marketplace</h1></div></div>
        <div className="shop-header-actions"><span className="shop-demo">Demo shop</span><button ref={close} className="settings-icon-button" type="button" aria-label="Close marketplace" onClick={onClose}><CloseIcon /></button></div>
      </header>
      <div ref={contentRef} className="shop-content gold-scroll">
        <section className="shop-intro"><p className="shop-eyebrow">A PERSONAL TOUCH. THE SAME GREAT GAME.</p><h2>Make every move yours.</h2><p>Your board. Your pieces. Your signature move.</p><p className="shop-demo-note">Demo shop · Free unlocks · No payments</p></section>
        <div className="shop-layout">
          <div className="shop-catalog">
            <nav className="shop-filters" aria-label="Shop categories">{FILTERS.map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => changeFilter(id)}>{label}{id === "owned" && <span className="shop-count">{collection.owned.length}</span>}</button>)}</nav>
            <div className="shop-preview-toolbar"><button type="button" className="shop-live-toggle" disabled={reduced} aria-pressed={previewsPaused} onClick={() => { setPreviewsPaused((paused) => !paused); setReplaying(false); setExplicitMotion(false); setPlay(0); }}>{reduced ? "Reduced motion" : previewsPaused ? "Resume live previews" : "Pause live previews"}</button></div>
            <div className="shop-products" aria-label={FILTERS.find(([id]) => id === filter)?.[1]}>
              {items.map((item) => <button type="button" key={item.id} className={`shop-product${item.id === selected.id ? " shop-product-selected" : ""}`} aria-pressed={item.id === selected.id} onClick={() => choose(item)}>
                <div className="shop-product-art"><span className="shop-product-tag">{item.tag}</span><ProductArt item={item} animate={autoPreview} /></div>
                <div className="shop-product-copy"><span className="shop-product-category">{item.category === "effect" ? "Effect" : item.category === "bundle" ? "Collection" : item.category === "board" ? "Board" : "Piece set"}</span><h3>{item.name}</h3><div className="shop-product-bottom"><span>{samplePrice(item)}</span><span className="shop-product-state">{isEquipped(item, collection.equipped) ? "Equipped" : collection.owned.includes(item.id) ? "In collection" : "Preview"}</span></div></div>
              </button>)}
            </div>
            <p className="shop-fair"><CrownIcon /> Every purchase is cosmetic. Skill wins the game.</p>
          </div>
          <aside ref={detail} tabIndex={-1} className="shop-detail" data-fits={detailFits} aria-label="Selected item">
            <div className="shop-detail-heading"><div><p className="shop-eyebrow">{selected.tag}</p><h2>{selected.name}</h2></div><div className="shop-price"><strong>{samplePrice(selected)}</strong><span>{selected.price ? "Sample USD price" : "Always free"}</span></div></div>
            <div className="shop-preview-controls">
              <div role="group" aria-label="Your assigned colour"><button type="button" aria-pressed={owner === "black"} onClick={() => { setOwner("black"); setPlay((value) => value + 1); }}>You play Black</button><button type="button" aria-pressed={owner === "white"} onClick={() => { setOwner("white"); setPlay((value) => value + 1); }}>You play White</button></div>
              <div role="group" aria-label="Preview perspective"><button type="button" aria-pressed={!friend} onClick={() => setFriend(false)}>Your view</button><button type="button" aria-pressed={friend} onClick={() => setFriend(true)}>Friend’s view</button></div>
            </div>
            <div ref={previewStage} className="shop-preview-stage">
              <ShopPreview look={preview} large owner={owner} friend={friend} play={play} autoPlay={autoPreview} replaying={replaying} explicitMotion={explicitMotion} onReplayEnd={() => { setReplaying(false); setExplicitMotion(false); }} />
              <button type="button" className="shop-replay" onClick={replayPreview}>{reduced ? "Play once" : "Replay move & effect"} <span aria-hidden="true">↻</span></button>
              <p className="shop-motion-note">{reduced ? "Reduced motion is on. Play once animates only this preview." : previewsPaused ? "Live previews paused. Replay a move whenever you like." : "Live preview. Only your piece uses the effect."}</p>
            </div>
            <div className="shop-detail-copy"><p className="shop-description">{selected.description}</p>
              <details className="shop-more-details" key={selected.id}><summary>More details</summary>
                <p className="shop-ownership">{selected.category === "board" ? "Only your screen uses this board. A friend keeps their own board." : "Your colour picks the dark or light finish. Friends see it on your pieces and moves, and keep their own cosmetics."}</p>
                {selected.category === "bundle" && <ul className="shop-includes"><li>Midnight Marble board</li><li>Gold &amp; Ivory pieces</li><li>Royal Seal King effect</li></ul>}
                <p className="shop-extra-note">{selected.price ? "A single demo unlock. Real payments are not enabled." : "Included with the game. Always free."}</p>
              </details>
              {confirming ? <div className="shop-confirm"><p>Add this to your own demo collection? No payment is taken. This does not unlock anything for another player.</p><div className="shop-confirm-actions"><button ref={primary} className="shop-primary" type="button" disabled={!ready} onClick={() => { store.addDemo(selected.id); setConfirming(false); setNotice(`${selected.name} added. You can equip it now.`); }}>Confirm demo unlock</button><button className="shop-secondary" type="button" onClick={() => setConfirming(false)}>Cancel</button></div></div> : <button ref={primary} className="shop-primary" type="button" disabled={!ready || (owned && equipped)} onClick={() => {
                if (owned) { store.equip(selected.id); setNotice(`${selected.name} equipped for your own pieces and moves.`); }
                else setConfirming(true);
              }}>{owned ? equipped ? "Equipped" : "Equip look" : "Try demo unlock"}</button>}
              <p className="shop-notice" role="status">{notice || "Free demo unlock. Saved on this device."}</p>
              <button className="shop-secondary shop-back-to-items" type="button" onClick={() => panel.current?.querySelector(".shop-filters")?.scrollIntoView({ block: "start" })}>Back to items</button>
            </div>
          </aside>
        </div>
        <footer className="shop-footer"><span>Crafted for your next great game.</span><span>Sample storefront · Real purchases are not enabled.</span></footer>
      </div>
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
