// The username rules for the leaderboard, shared by the browser (inline
// errors while typing) and the server (which repeats every check and never
// trusts the browser). Pure: no DOM, no network.
//
// A username is public and unique, compared without case. The word checks
// reuse the AI's word lists and their normalization (src/ai/language.ts), so
// there is one list of words to keep up to date.
import { HARD_LINE_WORDS, STRONG_SWEARS, classify, lowerPlain, unLeet } from "../ai/language";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;

export type UsernameRule =
  | "length"
  | "spaces"
  | "characters"
  | "startLetter"
  | "endUnderscore"
  | "doubleUnderscore"
  | "repeats"
  | "blocked"
  | "reserved";

// One calm line per rule, shown under the field. Written without dashes.
export const USERNAME_MESSAGES: Readonly<Record<UsernameRule, string>> = {
  length: `Use ${USERNAME_MIN} to ${USERNAME_MAX} characters.`,
  spaces: "Spaces are not allowed.",
  characters: "Use only letters, numbers and underscores.",
  startLetter: "Start with a letter.",
  endUnderscore: "Do not end with an underscore.",
  doubleUnderscore: "Use one underscore at a time.",
  repeats: "No more than 3 of the same character in a row.",
  blocked: "This name is not allowed. Please choose another.",
  reserved: "This name is reserved. Please choose another.",
};

// Names that could pass for the game, its staff or the AI. A name is
// reserved when one of its parts (split at underscores and between letters
// and digits) is one of these words.
export const RESERVED_NAMES = [
  "admin", "administrator", "moderator", "mod", "support", "help", "checkervia", "checkvia", "official", "ai",
  "computer", "system", "staff", "team", "owner", "root", "dev", "developer", "null", "undefined",
];
// Reserved anywhere in the name (theofficial, checkervia_fan).
const RESERVED_ANYWHERE = ["checkervia", "checkvia", "moderator", "administrator", "official"];
// Reserved at the start (admin2go, support_desk). Not anywhere, so that
// "badminton" stays allowed.
const RESERVED_START = ["admin", "support", "computer", "system"];

// Listed words that are also found inside harmless names (peacock, grape,
// virginia, pakistan, baldwin, dickens), so they are only blocked as a whole
// part of a name, never inside a longer word.
const WHOLE_PART_ONLY = ["dick", "cock", "prick", "dyke", "paki", "rape", "bald", "virgin", "nazi"];
// Harmless names that contain a listed word (the classic Scunthorpe case).
const HARMLESS_INSIDE = ["scunthorpe", "therapist"];

// A pattern that finds `word` anywhere, with each letter possibly stretched
// (fuuuck) but never shortened: a double letter in the word must stay at
// least double, so "nigeria" is not read as a slur.
function insidePattern(word: string): RegExp {
  const runs = word.match(/(.)\1*/g) ?? [];
  return new RegExp(runs.map((run) => `${run[0]}{${run.length},}`).join(""));
}

const INSIDE_PATTERNS = [...STRONG_SWEARS, ...HARD_LINE_WORDS]
  .filter((word) => word.length >= 4 && !WHOLE_PART_ONLY.includes(word))
  .map(insidePattern);

// Lower case with look alikes read as letters (4dm1n is admin).
const asLetters = (name: string) => unLeet(lowerPlain(name));

// The parts of a name, as letters: split at underscores (leetspeak read as
// letters), and split between letters and digits (digits dropped), so that
// both "f4ck" and "fuck123" are caught.
function partsOf(name: string): string[] {
  const lower = lowerPlain(name);
  const byUnderscore = asLetters(name).split("_");
  const byDigits = lower.split(/_|(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/).filter((part) => /^[a-z]+$/.test(part));
  return [...new Set([...byUnderscore, ...byDigits])].filter(Boolean);
}

// The whole name squeezed together, in both readings.
function compactForms(name: string): string[] {
  const forms = [asLetters(name).replace(/_/g, ""), lowerPlain(name).replace(/[^a-z]/g, "")];
  return [...new Set(forms)].map((form) => HARMLESS_INSIDE.reduce((text, harmless) => text.split(harmless).join(""), form));
}

/** True when the name contains listed language (swearing, slurs, sexual words). */
export function isBlockedName(name: string): boolean {
  const parts = [...partsOf(name), ...compactForms(name)];
  // Insults about play ("noob", "joker") are fine in a name; the rest is not.
  if (parts.some((part) => classify(part).some((wordClass) => wordClass !== "insult"))) return true;
  return compactForms(name).some((form) => INSIDE_PATTERNS.some((pattern) => pattern.test(form)));
}

/** True when the name could pass for the game, its staff or the AI. */
export function isReservedName(name: string): boolean {
  const parts = partsOf(name);
  if (parts.some((part) => RESERVED_NAMES.includes(part))) return true;
  return compactForms(name).some(
    (form) => RESERVED_ANYWHERE.some((word) => form.includes(word)) || RESERVED_START.some((word) => form.startsWith(word)),
  );
}

/**
 * Every rule the name breaks, in the order they are shown. Empty means the
 * name is valid (whether it is still free is a separate, server side check).
 */
export function usernameProblems(name: string): UsernameRule[] {
  const problems: UsernameRule[] = [];
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) problems.push("length");
  if (/\s/.test(name)) problems.push("spaces");
  if (/[^A-Za-z0-9_\s]/.test(name)) problems.push("characters");
  if (name.length > 0 && !/^[A-Za-z]/.test(name)) problems.push("startLetter");
  if (name.endsWith("_")) problems.push("endUnderscore");
  if (name.includes("__")) problems.push("doubleUnderscore");
  if (/(.)\1{3}/i.test(name)) problems.push("repeats");
  if (name.length > 0 && isBlockedName(name)) problems.push("blocked");
  else if (name.length > 0 && isReservedName(name)) problems.push("reserved");
  return problems;
}

export function isValidUsername(name: string): boolean {
  return usernameProblems(name).length === 0;
}

/** The form a username is compared and stored by: names differ only if this does. */
export function usernameKey(name: string): string {
  return name.toLowerCase();
}
