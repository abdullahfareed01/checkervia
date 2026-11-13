// The language rules (D45): the word lists, the normalising that catches
// disguised spellings, harmless words that contain a listed word, and the
// rules per level and per engine verdict. All with fake model lines.
import { describe, expect, it } from "vitest";
import { FALLBACK_REASON, checkReaction, checkReason, classify, fallbackLine, withoutDashes } from "./language";

describe("classify: blocked words", () => {
  it.each([
    ["That was shit.", "mild"],
    ["Damn, you walked into it.", "mild"],
    ["What the hell was that?", "mild"],
    ["You absolute idiot.", "insult"],
    ["Pathetic move.", "insult"],
    ["What the fuck was that?", "strong"],
    ["You bastard.", "strong"],
    ["Go back to your mom.", "hardLine"],
    ["I will kill you next turn.", "hardLine"],
    ["That move is so ugly, like you.", "hardLine"],
  ])("%s -> %s", (text, wordClass) => {
    expect(classify(text)).toContain(wordClass);
  });
});

describe("classify: disguised spellings are caught", () => {
  it.each([
    "sh1t move", "sh!t move", "$hit move", "f*ck that", "f**k that", "fuuuuck", "shiiiiit", "s h i t",
    "s.h.i.t", "a$$", "ID10T", "F U C K", "DAAAMN", "bullsh1t", "fùck",
  ])("%s", (text) => {
    expect(classify(text).length).toBeGreaterThan(0);
  });
});

describe("classify: harmless words that contain a listed word are not blocked", () => {
  it.each([
    "Hello there, nice class.", "Assess the board before you pass.", "That shell of a defence is gone.",
    "A classic scrap for the centre.", "Hellooo, are you awake?", "Scunthorpe is a town.", "Your assassin piece is bold.",
    "That was a fatal mistake.", "I will dumbfound you.", "Cocktail hour is over.", "The grass is greener on my side.",
    "I take 2 pieces in 1 turn.", "Move 4 to E5.", "Shiitake? No, checkers.",
  ])("%s", (text) => {
    expect(classify(text)).toEqual([]);
  });
});

describe("checkReaction: Easy, Medium and Hard stay clean", () => {
  it.each([1, 2, 3] as const)("level %i: light teasing passes unchanged", (level) => {
    expect(checkReaction("Bold plan. Let us see if it holds.", level, null)).toBe("Bold plan. Let us see if it holds.");
  });

  it.each([1, 2, 3] as const)("level %i: swearing is replaced, even after a blunder", (level) => {
    expect(checkReaction("Damn, that was a gift.", level, "blunder")).toBe(fallbackLine("blunder", 22));
  });

  it.each([1, 2, 3] as const)("level %i: insults are replaced", (level) => {
    const line = "You clown, that piece is mine.";
    expect(checkReaction(line, level, null)).toBe(fallbackLine(null, line.length));
  });
});

describe("checkReaction: Strongest", () => {
  it("mild swearing passes only after an engine verified blunder", () => {
    expect(checkReaction("Damn, you just handed me a piece.", 4, "blunder")).toBe("Damn, you just handed me a piece.");
  });

  it("after an ordinary move it may taunt, but swearing is replaced", () => {
    expect(checkReaction("Is that your big plan, genius? Pathetic.", 4, null)).toBe("Is that your big plan, genius? Pathetic.");
    expect(checkReaction("That was a shit move.", 4, null)).toBe(fallbackLine(null, 21));
  });

  it("after a great move: grudging respect, no swearing", () => {
    expect(checkReaction("Fine, good move. Enjoy it while it lasts.", 4, "great")).toBe("Fine, good move. Enjoy it while it lasts.");
    expect(checkReaction("Damn, that was good.", 4, "great")).toBe(fallbackLine("great", 20));
  });

  it("strong swearing is never allowed, even after a blunder", () => {
    expect(checkReaction("What the f*ck was that?", 4, "blunder")).toBe(fallbackLine("blunder", 23));
  });

  it.each([
    "Your mom plays better.", "I will hurt you.", "You fat loser.", "That move is gay as hell.".replace("gay", "retarded"),
    "Sexy move, not.",
  ])("the hard line is never crossed: %s", (line) => {
    for (const verdict of ["blunder", "great", null] as const) {
      expect(checkReaction(line, 4, verdict)).toBe(fallbackLine(verdict, line.length));
    }
  });
});

describe("no hyphens or dashes in what players see", () => {
  it("joins words, and turns dashes into commas", () => {
    expect(withoutDashes("What a brain-fart, moving into my capture—now you'll eat dust!")).toBe(
      "What a brain fart, moving into my capture, now you'll eat dust!",
    );
    expect(withoutDashes("Bold - but wrong.")).toBe("Bold, but wrong.");
    expect(withoutDashes("Wait – what?")).toBe("Wait, what?");
  });

  it("catches the other hyphens too (regression: the model wrote a non breaking one in a live check)", () => {
    expect(withoutDashes("Your so‑called clever slide.")).toBe("Your so called clever slide.");
    expect(withoutDashes("A well‐timed, half‒baked plan.")).toBe("A well timed, half baked plan.");
  });

  it.each([
    ["a dash at the start of a line", "- Wow, really?", "Wow, really?"],
    ["a dash at the start of the second line", "Line one\n— line two", "Line one\nline two"],
    ["a word that starts with a hyphen", "That was so -ish.", "That was so ish."],
    ["a word that ends with a hyphen", "Your pre- and post game plans.", "Your pre and post game plans."],
    ["several hyphens in a row", "Wait---what?", "Wait, what?"],
    ["a double hyphen as a dash", "Great move -- really.", "Great move, really."],
    ["a dash before a new sentence", "Watch this — Boom!", "Watch this. Boom!"],
    ["a dash at the end", "I see your plan —", "I see your plan"],
    ["a number range with a hyphen", "Up 3-4 pieces.", "Up 3 to 4 pieces."],
    ["a number range with an en dash", "Moves 10–12 were sharp.", "Moves 10 to 12 were sharp."],
    ["a negative score", "A score of -0.6 for you.", "A score of minus 0.6 for you."],
    ["a move arrow", "E3 -> D4 was a gift.", "E3 → D4 was a gift."],
    ["the figure dash and minus sign", "Up 1‒2 now − enjoy.", "Up 1 to 2 now, enjoy."],
    ["a soft hyphen", "check­mate", "check mate"],
    ["dashes next to punctuation", "Oops! — there it goes.", "Oops! there it goes."],
  ])("handles %s", (_, input, output) => {
    expect(withoutDashes(input)).toBe(output);
    expect(withoutDashes(input)).not.toMatch(/[-‐-―−­]/);
  });

  it("is applied to reactions and reasons", () => {
    expect(checkReaction("Self-destruct mode on?", 2, null)).toBe("Self destruct mode on?");
    expect(checkReason("Keeps the back-row safe.")).toBe("Keeps the back row safe.");
  });

  it("the fallback lines have none", () => {
    for (const verdict of ["blunder", "great", null] as const) {
      for (let seed = 0; seed < 3; seed++) expect(fallbackLine(verdict, seed)).not.toMatch(/[-‒-―]/);
    }
  });
});

describe("checkReason: the reason is clean at every level", () => {
  it("keeps a clean reason and replaces one with listed words", () => {
    expect(checkReason("Takes the centre.")).toBe("Takes the centre.");
    expect(checkReason("Because you are an idiot.")).toBe(FALLBACK_REASON);
  });
});
