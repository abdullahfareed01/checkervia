// The 18+ consent for Strongest (D45): the steps, the stored acceptance and
// its notice version, the dialogs' text, the Terms and the AI card's tag.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/ui/App";
import { CONSENT_KEY, NOTICE_VERSION, hasConsent, nextConsentStep, readConsent, saveConsent } from "../src/ui/consent";
import { ConsentDialog } from "../src/ui/ConsentDialog";
import { Home } from "../src/ui/Home";
import { CONTACT_EMAIL, TERMS_SECTIONS, TermsDialog } from "../src/ui/TermsDialog";

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
    "What is stored", "Contact", "No warranty",
  ])("has the section %s", (title) => {
    expect(html).toContain(`<h3>${title}</h3>`);
  });

  // Phase 4 (D57): the leaderboard is described as live, with what is stored,
  // the reported counters and removal by email (the owner's list).
  it("describes the leaderboard as live, with what is stored and how to have it removed", () => {
    expect(html).toContain("<h3>Leaderboard</h3>");
    expect(html).not.toContain("Coming soon");
    expect(html).not.toMatch(/will be|will apply|is not open yet|Nothing is stored on our server/);
    const leaderboard = TERMS_SECTIONS.find((section) => section.title === "Leaderboard")!.points.join(" ");
    for (const phrase of ["public and unique", "there is no tag", "replaying all of its moves", "reported by the game in your browser", "never stores your raw IP address, your age or your email", "No flag", "Clearing your browser data loses the profile"]) {
      expect(leaderboard).toContain(phrase);
    }
    expect(leaderboard).toContain(`email ${CONTACT_EMAIL}`);
    // Server storage begins only with a username.
    expect(TERMS_SECTIONS.find((section) => section.title === "What is stored")!.points.join(" ")).toContain("only once you choose a username");
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

describe("the AI card's 18+ badge and level chip (Change 4, D50)", () => {
  const render = (mode: "vs-ai" | "two-player", aiLevel: 1 | 2 | 3 | 4) => renderToStaticMarkup(createElement(App, { initial: { mode, aiLevel } }));
  // The name row of the AI's card (the top card).
  const nameRow = (html: string) => html.match(/<section class="card card-top[\s\S]*?<p class="card-name">([\s\S]*?)<\/p>/)![1]!;

  it("at Strongest: inside the name row, after the name, a two part badge that is a real button", () => {
    const row = nameRow(render("vs-ai", 4));
    expect(row).toMatch(/^<span class="card-name-text">AI<\/span>[\s\S]*<span class="card-chips"><span class="chip-level"[^>]*>Strongest<\/span><button type="button" class="chip-adult" aria-label="18 plus, strong language\. About the language rules">/);
    expect(row).toContain('<span class="chip-adult-age">18+</span><span class="chip-adult-text">Strong language</span>');
  });

  it.each([
    [1, "Friendly"],
    [2, "Playful"],
    [3, "Competitive"],
  ] as const)("level %i: one chip %s, and no 18+ badge", (level, voice) => {
    const html = render("vs-ai", level);
    expect(nameRow(html)).toContain(`>${voice}</span>`);
    expect(html.match(/class="chip-level"/g)).toHaveLength(1);
    expect(html).not.toContain("chip-adult");
  });

  it("no chips in two player games", () => {
    expect(render("two-player", 4)).not.toContain("card-chips");
  });
});
