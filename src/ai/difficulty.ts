// The AI difficulty levels. The model always chooses the move; a level only
// changes how much the engine works out for it first (see search.ts).

export type AiLevel = 1 | 2 | 3 | 4;

export interface LevelInfo {
  readonly name: string;
  // Turns the engine looks ahead for every legal move (0 = no look-ahead).
  // The AI's own move counts as the first turn.
  readonly depth: number;
  readonly description: string;
}

export const AI_LEVELS: Readonly<Record<AiLevel, LevelInfo>> = {
  1: { name: "Beginner", depth: 0, description: "The AI sees only the board and the list of legal moves." },
  2: { name: "Casual", depth: 2, description: "The engine checks every reply to each move before the AI chooses." },
  3: { name: "Strong", depth: 4, description: "The engine plays out every possible line 4 turns ahead." },
  4: { name: "Expert", depth: 6, description: "The engine plays out every possible line 6 turns ahead." },
};

export const LEVELS: readonly AiLevel[] = [1, 2, 3, 4];
export const DEFAULT_AI_LEVEL: AiLevel = 2;

/** A valid level from any value (for example one read back from storage). */
export function toAiLevel(value: unknown): AiLevel {
  const number = typeof value === "string" ? Number(value) : value;
  return LEVELS.includes(number as AiLevel) ? (number as AiLevel) : DEFAULT_AI_LEVEL;
}
