// The language rules for the AI's lines, enforced in code (D45). The prompt
// asks the model to behave; this file makes sure it did. All word lists live
// here, so there is one place to read and change them.
//
// - Easy, Medium, Hard: clean. No swearing, no insults, light teasing only.
// - Strongest: insults about the player's play are fine. Mild swearing only
//   right after a move the engine verified as a blunder.
// - Every level: never strong swearing, slurs, hate, sexual content, remarks
//   about real world traits, family or identity, or threats.
// A line that breaks a rule is replaced with a clean fallback line.
//
// Limits: a word list catches words, not meaning. A cleverly worded insult
// with no listed word gets through (see docs/03-technical/ai-opponent.md).
import type { AiLevel } from "./difficulty";
import type { Verdict } from "./judge";

// Mild swearing: allowed only at Strongest, after a verified blunder.
export const MILD_SWEARS = [
  "damn", "dammit", "goddamn", "hell", "crap", "crappy", "ass", "arse", "asshat", "dumbass", "jackass", "badass",
  "bloody", "shit", "shitty", "bullshit", "piss", "pissed", "bugger", "sucks",
];

// Insults about the player: allowed only at Strongest.
export const INSULTS = [
  "idiot", "idiotic", "stupid", "moron", "moronic", "dumb", "loser", "pathetic", "clown", "noob", "fool", "foolish",
  "dimwit", "imbecile", "trash", "garbage", "brainless", "clueless", "incompetent", "amateur", "joke", "laughable",
  "embarrassing", "brainfart", "scrub",
];

// Strong swearing: never allowed.
export const STRONG_SWEARS = [
  "fuck", "fucking", "fucker", "fucked", "motherfucker", "wtf", "stfu", "cunt", "bitch", "bastard", "dick", "dickhead",
  "cock", "prick", "twat", "wanker", "bollocks", "shithead", "asshole", "douche", "douchebag", "slut", "whore",
];

// The hard line: slurs, hate, sexual words, real world traits. Never allowed.
export const HARD_LINE_WORDS = [
  "nigger", "nigga", "faggot", "fag", "dyke", "tranny", "retard", "retarded", "spic", "chink", "kike", "wetback",
  "paki", "gook", "raghead", "towelhead", "cripple", "spastic",
  "sex", "sexy", "porn", "horny", "naked", "nude", "penis", "vagina", "boobs", "tits", "rape", "rapist", "orgasm",
  "fat", "ugly", "obese", "bald", "virgin", "nazi", "hitler", "terrorist",
];

// The hard line, phrases: family, identity and threats.
export const HARD_LINE_PHRASES = [
  "your mom", "your mother", "your mama", "your dad", "your father", "your sister", "your brother", "your wife",
  "your girlfriend", "your boyfriend", "your family", "your kids", "your race", "your religion", "your country",
  "your face", "your body", "your looks", "kill you", "kill yourself", "kys", "hurt you", "find you", "beat you up",
  "punch you", "you will die", "you'll die", "go die", "i will end you", "watch your back",
];

// Harmless words that a listed word plus a usual ending would catch
// ("cock" + "y"). Checked first, so clean lines are never blocked.
export const HARMLESS_WORDS = ["cocky", "cockiness", "dicky", "hello", "shell", "assess", "class", "pass", "bass"];

export type WordClass = "mild" | "insult" | "strong" | "hardLine";

// Leetspeak and look-alike symbols, read as the letters they stand for.
const LOOK_ALIKES: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "+": "t", "8": "b",
};
// Symbols used to hide a letter, as in f*ck or sh#t.
const MASKS = "*#%";
// Punctuation that only ends or starts a word ("Damn!" is "damn").
const EDGE_PUNCTUATION = /^[.,!?;:'"()[\]]+|[.,!?;:'"()[\]]+$/g;

// Lower case with accents removed.
function lowerPlain(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Look-alikes replaced by their letters.
const unLeet = (text: string) => [...text].map((char) => LOOK_ALIKES[char] ?? char).join("");

// A pattern for one listed word inside one token: each letter may be
// stretched (shiiit), hidden by a mask (f*ck) or split by dots or dashes
// (s.h.i.t), and the usual endings are allowed (shits, damned, sucking).
function wordPattern(word: string): RegExp {
  const letters = [...word].map((letter) => `(?:${letter}|[${MASKS}])+`).join("[._\\-']*");
  return new RegExp(`^${letters}(?:s|es|ed|d|ing|er|ers|y|ty)?$`);
}

// A pattern for a phrase in the cleaned text, word by word, letters may be
// stretched; an apostrophe may be left out.
function phrasePattern(phrase: string): RegExp {
  const words = phrase.split(" ").map((word) => [...word].map((char) => (char === "'" ? "'?" : `${char}+`)).join(""));
  return new RegExp(`(?:^|\\s)${words.join("\\s+")}(?=\\s|$)`);
}

const WORD_CLASSES: readonly (readonly [WordClass, readonly RegExp[]])[] = [
  ["hardLine", HARD_LINE_WORDS.map(wordPattern)],
  ["strong", STRONG_SWEARS.map(wordPattern)],
  ["mild", MILD_SWEARS.map(wordPattern)],
  ["insult", INSULTS.map(wordPattern)],
];
const PHRASES = HARD_LINE_PHRASES.map(phrasePattern);

// The words of a text, look-alikes read as letters, plus runs of single
// letters joined up, so that spaced out words (s h i t) are caught too.
function tokensOf(text: string): string[] {
  const tokens = lowerPlain(text)
    .split(/\s+/)
    .map((token) => unLeet(token.replace(EDGE_PUNCTUATION, "")))
    .filter(Boolean);
  const joined: string[] = [];
  let run = "";
  for (const token of [...tokens, ""]) {
    if (token.length === 1) run += token;
    else {
      if (run.length > 1) joined.push(run);
      run = "";
    }
  }
  return [...tokens, ...joined].filter((token) => !HARMLESS_WORDS.includes(token));
}

/** Every class of listed language found in `text`, most serious first. */
export function classify(text: string): WordClass[] {
  const tokens = tokensOf(text);
  const words = ` ${tokens.join(" ").replace(/[^a-z' ]+/g, " ")} `;
  const found = new Set<WordClass>();
  if (PHRASES.some((pattern) => pattern.test(words))) found.add("hardLine");
  for (const [wordClass, patterns] of WORD_CLASSES) {
    if (tokens.some((token) => patterns.some((pattern) => pattern.test(token)))) found.add(wordClass);
  }
  return WORD_CLASSES.map(([wordClass]) => wordClass).filter((wordClass) => found.has(wordClass));
}

/** True when a shown line has 18+ words (mild swearing or insults), which
 * the bubble shows in red text (only possible at Strongest). */
export function hasAdultWords(text: string): boolean {
  return classify(text).length > 0;
}

// Every hyphen-like character, read as a plain hyphen; every dash-like
// character, read as an em dash. (Written as escapes so they are visible.)
const HYPHENS = /[\u2010\u2011\u2012\u00ad\u2043\ufe63\uff0d]/g;
const DASHES = /[\u2013\u2014\u2015\u2212\ufe58]/g;
const EM = "\u2014";

// One line without hyphens or dashes (see withoutDashes).
function lineWithoutDashes(line: string): string {
  let text = line.replace(HYPHENS, "-").replace(DASHES, EM);
  text = text
    .replace(/<-+/g, "\u2190") // arrows in move notation
    .replace(/-+>/g, "\u2192")
    .replace(/(\d)\s*(?:-+|\u2014)\s*(?=\d)/g, "$1 to ") // ranges: 3-4 is "3 to 4"
    .replace(/(^|[\s(])-(?=\d)/g, "$1minus ") // a negative number
    .replace(/([\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, "$1 ") // brain-fart is "brain fart" (one hyphen only)
    .replace(/^[\s\-\u2014]+/, "") // a dash starting the line
    .replace(/[\s\-\u2014]+$/, "") // or ending it
    .replace(/(^|\s)-+(?=\S)/g, "$1") // a word starting with a hyphen: -ish
    .replace(/(\S)-+(?=\s)/g, "$1"); // or ending with one: pre- and post game
  // What is left joins two parts of a sentence: a full stop before a capital
  // letter, otherwise a comma.
  text = text.replace(/\s*(?:-+|\u2014+)\s*(?=(\S))/g, (_, next: string) => (/\p{Lu}/u.test(next) ? ". " : ", "));
  return text
    .replace(/([.,!?;:])\s*[.,](?=\s|$)/g, "$1") // "!," or ".." after a joint
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Text without hyphens or dashes, for anything players read (the owner's
 * rule, D45): "brain-fart" becomes "brain fart", "mine—now" becomes
 * "mine, now", "3-4" becomes "3 to 4", "E3 -> D4" becomes "E3 → D4", and a
 * dash before a new sentence becomes a full stop. Every kind of hyphen and
 * dash character counts (the non breaking hyphen too). Line by line.
 */
export function withoutDashes(text: string): string {
  return text.split("\n").map(lineWithoutDashes).join("\n").trim();
}

// Clean lines used when the model's line breaks a rule. No dashes.
const FALLBACKS: Readonly<Record<Verdict | "plain", readonly string[]>> = {
  blunder: ["Oops, that one hands me a chance.", "That move just opened a door for me.", "I will happily take that gift."],
  great: ["Well played. I did not see that coming.", "Good move. You made me think there.", "Fine, that was a strong move."],
  plain: ["Your move is noted. Let us see where this goes.", "Interesting choice. My turn now.", "All right, let us keep going."],
};

// The longest reaction line shown (Change 3): it fits the chat bubble.
export const MAX_LINE_LENGTH = 140;

/**
 * A line cut to at most `max` characters at a word boundary, never in the
 * middle of a word, ending with "…" when it was cut.
 */
export function capLength(text: string, max = MAX_LINE_LENGTH): string {
  if (text.length <= max) return text;
  const room = text.slice(0, max); // "…" takes the last place
  const lastSpace = room.lastIndexOf(" ");
  const cut = (lastSpace > 0 ? room.slice(0, lastSpace) : room.slice(0, max - 1)).replace(/[\s,;:.]+$/, "");
  return `${cut}\u2026`;
}

/**
 * Every AI line shown to players goes through here: no hyphens or dashes,
 * then the length cap. (The language rules come first, in checkReaction.)
 */
export function tidyLine(text: string, max = MAX_LINE_LENGTH): string {
  return capLength(withoutDashes(text), max);
}

/** A clean line for when the model's line was not allowed. */
export function fallbackLine(verdict: Verdict | null, seed: number): string {
  const lines = FALLBACKS[verdict ?? "plain"];
  return lines[Math.abs(Math.trunc(seed)) % lines.length]!;
}

/** True if `level` uses the strong language rules (only Strongest). */
export function strongLanguage(level: AiLevel | undefined): boolean {
  return level === 4;
}

/**
 * The AI's reaction as it may be shown, or a clean fallback line if it
 * breaks a rule for this level and the engine's verdict on the player's move.
 */
export function checkReaction(text: string, level: AiLevel | undefined, verdict: Verdict | null): string {
  const found = classify(text);
  const strong = strongLanguage(level);
  const allowed = (wordClass: WordClass) =>
    (wordClass === "insult" && strong) || (wordClass === "mild" && strong && verdict === "blunder");
  if (found.some((wordClass) => !allowed(wordClass))) return fallbackLine(verdict, text.length);
  return tidyLine(text);
}

// Shown instead of a reason that is not clean (the reason is always clean).
export const FALLBACK_REASON = "I picked this move from the engine's list.";

/** The AI's reason as it may be shown: clean at every level, no dashes. */
export function checkReason(text: string): string {
  return classify(text).length > 0 ? FALLBACK_REASON : withoutDashes(text);
}
