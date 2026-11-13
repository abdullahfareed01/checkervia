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
  return [...tokens, ...joined];
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

/**
 * Hyphens and dashes taken out of a line shown to players: "brain-fart"
 * becomes "brain fart", "mine—now" becomes "mine, now".
 */
export function withoutDashes(text: string): string {
  return text
    .replace(/\s*[–-―−]\s*/g, ", ") // en and em dashes, minus
    .replace(/[‐-‒­]/g, "-") // other hyphens (e.g. the non breaking one) read as "-"
    .replace(/\s+-+\s+/g, ", ")
    .replace(/(\w)-+(\w)/g, "$1 $2")
    .replace(/-+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Clean lines used when the model's line breaks a rule. No dashes.
const FALLBACKS: Readonly<Record<Verdict | "plain", readonly string[]>> = {
  blunder: ["Oops, that one hands me a chance.", "That move just opened a door for me.", "I will happily take that gift."],
  great: ["Well played. I did not see that coming.", "Good move. You made me think there.", "Fine, that was a strong move."],
  plain: ["Your move is noted. Let us see where this goes.", "Interesting choice. My turn now.", "All right, let us keep going."],
};

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
  return withoutDashes(text);
}

// Shown instead of a reason that is not clean (the reason is always clean).
export const FALLBACK_REASON = "I picked this move from the engine's list.";

/** The AI's reason as it may be shown: clean at every level, no dashes. */
export function checkReason(text: string): string {
  return classify(text).length > 0 ? FALLBACK_REASON : withoutDashes(text);
}
