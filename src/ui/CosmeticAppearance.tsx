import { createContext, useContext } from "react";
import { ORIGINAL_SIDES } from "../state/cosmeticAppearance";
import type { BoardAppearance } from "../state/cosmeticAppearance";

export const CosmeticSides = createContext<BoardAppearance["sides"]>(ORIGINAL_SIDES);
export const useCosmeticSides = () => useContext(CosmeticSides);
