// Turns the model's text into a move number, or says exactly why it cannot.
// The model is never trusted: a reply is accepted only if it holds one whole
// number between 1 and the length of the legal move list.
// The model may also give a short "reason". It is optional, never checked for
// truth, and only ever shown as plain text labelled as the model's own words.

// Longest reason kept; anything longer is cut, so a rambling model cannot
// flood the popup.
export const MAX_REASON_LENGTH = 200;

export type ParseResult =
  | { ok: true; number: number; reason?: string; reaction?: string }
  | { ok: false; reason: string };

// Finds every valid JSON object inside the text, ignoring any words or code
// fences around it. Scans for balanced braces (skipping braces inside strings).
function findJsonObjects(text: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];

  for (let start = 0; start < text.length; start++) {
    if (text[start] !== "{") continue;

    const end = findClosingBrace(text, start);
    if (end < 0) continue;

    try {
      const value: unknown = JSON.parse(text.slice(start, end + 1));
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        found.push(value as Record<string, unknown>);
        start = end; // skip past this object
      }
    } catch {
      // Not valid JSON from this brace; keep scanning from the next character.
    }
  }
  return found;
}

// Index of the brace that closes the one at `start`, or -1 if there is none.
function findClosingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === "\\") i++; // skip the escaped character
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Names a JSON value for an error message.
function typeName(value: unknown): string {
  if (value === null) return "null";
  return Array.isArray(value) ? "an array" : typeof value;
}

// The model's reason as one tidy line, or undefined if it gave none.
// Whitespace is collapsed and long text is cut at MAX_REASON_LENGTH.
export function cleanReason(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (text === "") return undefined;
  return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…` : text;
}

// Reads the move number (and the optional reason) out of the model's reply.
// `moveCount` is the length of the legal move list; valid numbers are 1 to moveCount.
export function parseReply(text: string, moveCount: number): ParseResult {
  const objects = findJsonObjects(text).filter((object) => "move" in object);
  const values = objects.map((object) => object["move"]);

  if (values.length === 0) {
    return { ok: false, reason: 'No JSON object with a "move" field was found.' };
  }
  if (values.some((value) => value !== values[0])) {
    return { ok: false, reason: "The reply contains more than one different move." };
  }

  const move = values[0];
  if (typeof move !== "number") {
    return { ok: false, reason: `"move" must be a number, but it was ${typeName(move)}.` };
  }
  if (!Number.isInteger(move)) {
    return { ok: false, reason: `"move" must be a whole number, but it was ${move}.` };
  }
  if (move < 1 || move > moveCount) {
    return {
      ok: false,
      reason: `Move ${move} is not in the list. Choose a number from 1 to ${moveCount}.`,
    };
  }
  const reason = cleanReason(objects[0]!["reason"]);
  const reaction = cleanReason(objects[0]!["reaction"]);
  return {
    ok: true,
    number: move,
    ...(reason === undefined ? {} : { reason }),
    ...(reaction === undefined ? {} : { reaction }),
  };
}
