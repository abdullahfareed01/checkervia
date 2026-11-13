// The AI difficulty levels. The model always chooses the move; a level sets
// how far the engine looks ahead and how many of its best moves the model may
// choose from (see search.ts and candidates.ts). D44.
//
// A "turn" (a ply) is one move by one side. A multi jump is one turn.
// 6 turns ahead means 3 moves by each side, the AI's own move first.

export type AiLevel = 1 | 2 | 3 | 4;

export interface LevelInfo {
  readonly name: string;
  // Turns (plies) the engine looks ahead for every legal move. The AI's own
  // move counts as the first turn.
  readonly depth: number;
  // How many of the engine's best moves the model may choose from;
  // undefined = every legal move.
  readonly candidates?: number;
  // Chance per turn that the model gets no engine scores and chooses on its
  // own (the Easy level's deliberate slips). 0 = never.
  readonly slipChance: number;
  readonly description: string; // one line, shown when choosing a level
  readonly voice: string; // the AI's character at this level, a chip on its card (Change 4)
}

export const AI_LEVELS: Readonly<Record<AiLevel, LevelInfo>> = {
  1: {
    name: "Easy",
    depth: 1,
    slipChance: 0.3,
    description: "Looks 1 turn ahead, any move allowed, and sometimes plays without the engine's help.",
    voice: "Friendly",
  },
  2: { name: "Medium", depth: 2, candidates: 5, slipChance: 0, description: "Looks 2 turns ahead (its move and your reply) and picks from its best 5 moves.", voice: "Playful" },
  3: { name: "Hard", depth: 4, candidates: 4, slipChance: 0, description: "Looks 4 turns ahead (2 moves each) and picks from its best 4 moves.", voice: "Competitive" },
  4: { name: "Strongest", depth: 6, candidates: 3, slipChance: 0, description: "Looks 6 turns ahead (3 moves each) and picks from its best 3 moves.", voice: "Strongest" },
};

export const LEVELS: readonly AiLevel[] = [1, 2, 3, 4];
export const DEFAULT_AI_LEVEL: AiLevel = 2;

/** A valid level from any value (for example one read back from storage). */
export function toAiLevel(value: unknown): AiLevel {
  const number = typeof value === "string" ? Number(value) : value;
  return LEVELS.includes(number as AiLevel) ? (number as AiLevel) : DEFAULT_AI_LEVEL;
}
