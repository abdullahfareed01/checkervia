// Two actual Board instances, never imported by the production game.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { applyMove, getLegalMoves, initialBoard } from "../../src/engine";
import type { Board as BoardType, Move, Player } from "../../src/engine";
import { boardAppearance } from "../../src/state/cosmeticAppearance";
import { createCollectionStore, emptyCollection } from "../../src/state/marketplace";
import { Board } from "../../src/ui/Board";
import { Marketplace } from "../../src/ui/Marketplace";
import { leaderboardStore } from "../../src/ui/leaderboard/profile";
import { settingsStore } from "../../src/ui/settings";
import { useMarketplace } from "../../src/ui/useMarketplace";
import "../../src/ui/styles.css";
import "../../src/ui/chrome.css";
import "../../src/ui/motion.css";
import "../../src/ui/settings.css";
import "../../src/ui/marketplace.css";
import "../../src/ui/cosmetics.css";

const inventory = createCollectionStore(null);
for (const id of ["amethyst", "comet", "jade"]) { inventory.addDemo(id); inventory.equip(id); }

function Harness() {
  const [owner, setOwner] = useState<Player>("black");
  const [shop, setShop] = useState(false);
  const [accounts, setAccounts] = useState(false);
  const account = useMarketplace();
  const [game, setGame] = useState<{ board: BoardType; before: BoardType | null; last: Move | null; side: Player; ply: number }>({ board: initialBoard(), before: null, last: null, side: "black", ply: 0 });
  Object.assign(window, {
    cosmeticHarness: {
      owner: (side: Player) => flushSync(() => { setOwner(side); setGame({ board: initialBoard(), before: null, last: null, side: "black", ply: 0 }); }),
      advance: () => flushSync(() => setGame((current) => {
        const move = getLegalMoves(current.board, current.side)[0]!;
        return { before: current.board, board: applyMove(current.board, move), last: move, side: current.side === "black" ? "white" : "black", ply: current.ply + 1 };
      })),
      motion: (level: "off" | "standard") => { document.documentElement.dataset.anim = level; settingsStore().update((current) => ({ ...current, animation: { ...current.animation, level } })); },
      effect: (id: string) => { inventory.addDemo(id); inventory.equip(id); flushSync(() => setGame((current) => ({ ...current }))); },
      profile: (letter: string) => flushSync(() => { setAccounts(true); leaderboardStore.setProfile({ username: `Owner${letter}`, token: letter.repeat(43), avatar: null, country: null }); }),
      shop: () => flushSync(() => setShop(true)),
    },
  });
  const owned = accounts ? account.collection : inventory.get();
  const players = owner === "black" ? { black: owned, white: emptyCollection() } : { black: emptyCollection(), white: owned };
  return <main style={{ padding: 24, display: "flex", flexWrap: "wrap", gap: 24 }}>
    {(["black", "white"] as const).map((viewer) => <section key={viewer} data-viewer={viewer} style={{ "--board-size": "min(76vw, 340px)" } as React.CSSProperties}>
      <h1 style={{ fontSize: 20 }}>{viewer === owner ? "Buyer view" : "Friend view"}</h1>
      <Board appearance={boardAppearance(viewer, players)} onSquareClick={() => {}} view={{ board: game.board, previousBoard: game.before, lastMove: game.last, moveKey: game.ply, flipped: viewer === "white", selected: null, selectable: [], mustCapture: [], destinations: [], routeChoices: [], locked: true }} />
    </section>)}
    {shop && <Marketplace onClose={() => setShop(false)} />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
