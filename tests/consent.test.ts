// The 18+ consent for Strongest (D45): the steps, the stored acceptance and
// its notice version, the dialogs' text, the Terms and the AI card's tag.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/ui/App";
import { CONSENT_KEY, NOTICE_VERSION, hasConsent, nextConsentStep, readConsent, saveConsent } from "../src/ui/consent";
import { ConsentDialog } from "../src/ui/ConsentDialog";
import { Home } from "../src/ui/Home";
import { CONTACT_EMAIL, TermsDialog } from "../src/ui/TermsDialog";

const noop = () => {};

function fakeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
}

describe("consent steps", () => {
  it("Yes to the age question leads to the notice; accepting the notice accepts", () => {
    expect(nextConsentStep("age", true)).toBe("notice");
    expect(nextConsentStep("notice", true)).toBe("accepted");
  });

  it("No or Cancel lead to the friendly message, which then closes", () => {
    expect(nextConsentStep("age", false)).toBe("declined");
    expect(nextConsentStep("notice", false)).toBe("declined");
    expect(nextConsentStep("declined", true)).toBe("closed");
    expect(nextConsentStep("declined", false)).toBe("closed");
  });
});

describe("stored acceptance", () => {
  it("is missing at first, then stored with the time and the notice version", () => {
    const store = fakeStore();
    expect(hasConsent(store)).toBe(false);
    const record = saveConsent(new Date("2026-11-13T10:00:00Z"), store);
    expect(record).toEqual({ version: NOTICE_VERSION, acceptedAt: "2026-11-13T10:00:00.000Z" });
    expect(JSON.parse(store.data.get(CONSENT_KEY)!)).toEqual(record);
    expect(hasConsent(store)).toBe(true);
  });

  it("is asked again when the notice version changes", () => {
    const store = fakeStore({ [CONSENT_KEY]: JSON.stringify({ version: NOTICE_VERSION - 1, acceptedAt: "2026-01-01T00:00:00.000Z" }) });
    expect(readConsent(store)?.version).toBe(NOTICE_VERSION - 1);
    expect(hasConsent(store)).toBe(false);
  });

  it("does not trust broken or missing storage", () => {
    for (const bad of ["not json", "null", "{}", '{"version":"1","acceptedAt":5}']) {
      expect(hasConsent(fakeStore({ [CONSENT_KEY]: bad }))).toBe(false);
    }
    expect(hasConsent(null)).toBe(false);
    expect(() => saveConsent(new Date(), null)).not.toThrow();
  });

  it("stores no age, only the acceptance", () => {
    const store = fakeStore();
    saveConsent(new Date(), store);
    expect(Object.keys(JSON.parse(store.data.get(CONSENT_KEY)!)).sort()).toEqual(["acceptedAt", "version"]);
  });
});

describe("consent dialog text", () => {
  const render = (step: "age" | "notice" | "declined") => renderToStaticMarkup(createElement(ConsentDialog, { step, onAnswer: noop }));

  it("step 1 asks the age question", () => {
    const html = render("age");
    expect(html).toContain("Strongest level is for adults. Are you 18 or older?");
    expect(html).toContain(">Yes, I am 18 or older<");
    expect(html).toContain(">No<");
  });

  it("step 2 shows the notice, links the Terms, and offers accept or cancel", () => {
    const html = render("notice");
    expect(html).toContain(
      "At this level the AI may use strong language, insults and mild profanity when you make mistakes. It is part of the game and is not meant seriously. Continue only if you accept this.",
    );
    expect(html).toContain(">Read the Terms and notices<");
    expect(html).toContain(">I understand and accept<");
    expect(html).toContain(">Cancel<");
  });

  it("No or Cancel end with a friendly message", () => {
    const html = render("declined");
    expect(html).toContain("No problem");
    expect(html).toContain("You can play Easy, Medium or Hard any time.");
  });
});

describe("Terms and notices", () => {
  const html = renderToStaticMarkup(createElement(TermsDialog, { onClose: noop }));

  it.each([
    "Entertainment only", "AI generated text", "Strong language at Strongest", "18 plus: a self declaration",
    "Leaderboard names are public", "What is stored", "Removing an entry", "No warranty",
  ])("has the section %s", (title) => {
    expect(html).toContain(`<h3>${title}</h3>`);
  });

  it("says plainly that age cannot be checked, and gives the contact email", () => {
    expect(html).toContain("we cannot check it");
    expect(CONTACT_EMAIL).toBe("checkvia.games@gmail.com");
    expect(html).toContain(CONTACT_EMAIL);
  });

  it("is linked from the home screen", () => {
    const home = renderToStaticMarkup(
      createElement(Home, { aiStatus: "ready", onPlay: noop, onHowToPlay: noop, onLearn: noop, onRecheck: noop, onTerms: noop }),
    );
    expect(home).toContain(">Terms and notices<");
  });
});

describe("the AI card's 18+ badge and voice chip (Change 4)", () => {
  const render = (mode: "vs-ai" | "two-player", aiLevel: 1 | 2 | 3 | 4) => renderToStaticMarkup(createElement(App, { initial: { mode, aiLevel } }));

  it("at Strongest: a two part badge that is a real button, next to the voice chip", () => {
    const html = render("vs-ai", 4);
    expect(html).toMatch(/<div class="card-edge"><span class="edge-voice">Strongest<\/span><button type="button" class="edge-adult" aria-label="18 plus, strong language\. About the language rules">/);
    expect(html).toContain('<span class="edge-adult-age">18+</span><span class="edge-adult-text">Strong language</span>');
  });

  it.each([
    [1, "Friendly"],
    [2, "Playful"],
    [3, "Competitive"],
  ] as const)("level %i: the voice chip %s, and no 18+ badge", (level, voice) => {
    const html = render("vs-ai", level);
    expect(html).toContain(`<span class="edge-voice">${voice}</span>`);
    expect(html).not.toContain("edge-adult");
  });

  it("nothing on the edge in two player games", () => {
    expect(render("two-player", 4)).not.toContain("card-edge");
  });
});
