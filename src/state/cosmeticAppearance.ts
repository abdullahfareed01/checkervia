import type { Player } from "../engine";
import { CLASSIC_LOOK, MARKET_ITEMS, emptyCollection } from "./marketplace";
import type { Collection, CosmeticSlot, Look } from "./marketplace";

export type SideFinish = Pick<Look, "pieces" | "effect">;
export interface BoardAppearance {
  readonly board: string;
  readonly sides: Readonly<Record<Player, SideFinish>>;
}
export const ORIGINAL_SIDES: Readonly<Record<Player, SideFinish>> = {
  black: { pieces: "classic", effect: "classic" },
  white: { pieces: "classic", effect: "classic" },
};

/** Resolve each slot against that participant's own inventory, never the
 * viewer's inventory or the other player's purchased bundle. */
export function ownedLook(collection: Collection): Look {
  const look = { ...CLASSIC_LOOK };
  for (const slot of Object.keys(look) as CosmeticSlot[]) {
    const value = collection.equipped[slot];
    if (MARKET_ITEMS.some((item) => collection.owned.includes(item.id) && item.look[slot] === value)) look[slot] = value;
  }
  return look;
}

export function boardAppearance(viewer: Player, players: Readonly<Record<Player, Collection>>): BoardAppearance {
  const black = ownedLook(players.black), white = ownedLook(players.white);
  return {
    board: viewer === "black" ? black.board : white.board,
    sides: { black: { pieces: black.pieces, effect: black.effect }, white: { pieces: white.pieces, effect: white.effect } },
  };
}

/** Local/AI play has one inventory owner. The other side owns no demo items. */
export function localAppearance(collection: Collection, owner: Player): BoardAppearance {
  return boardAppearance(owner, owner === "black" ? { black: collection, white: emptyCollection() } : { black: emptyCollection(), white: collection });
}
