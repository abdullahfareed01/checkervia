// Phase C: the AI voice. Speech text preparation, the voice choice and the
// per level style, and the engine's rules with a fake speechSynthesis.
import { describe, expect, it, vi } from "vitest";
import { withoutDashes } from "../src/ai/language";
import { defaultSettings } from "../src/ui/settings";
import type { Settings } from "../src/ui/settings";
import { bubbleKind } from "../src/ui/useVoice";
import { LEVEL_VOICE, MAX_SPEECH_LENGTH, pickVoice, prepareSpeech, voiceStyle } from "../src/ui/voice/speechText";
import { DUCK_LEVEL, createVoiceEngine } from "../src/ui/voice/voiceEngine";
import type { SynthLike } from "../src/ui/voice/voiceEngine";

describe("speech text", () => {
  it("strips emoji, including joined ones and skin tones", () => {
    expect(prepareSpeech("Nice move 😂🔥 haha")).toBe("Nice move haha");
    expect(prepareSpeech("GG 👍🏽 👨‍👩‍👧")).toBe("GG");
  });

  it("says lol and lmao letter by letter, and keeps haha", () => {
    expect(prepareSpeech("Bold move, lol.")).toBe("Bold move, L O L.");
    expect(prepareSpeech("LOLLL you missed it")).toBe("L O L you missed it");
    expect(prepareSpeech("lmao what was that")).toBe("L M A O what was that");
    expect(prepareSpeech("hahaha, hehe")).toBe("hahaha, hehe");
    expect(prepareSpeech("Lolita lollipop")).toBe("Lolita lollipop"); // not the word lol
  });

  it("says square names letter then number, and the move arrow as to", () => {
    expect(prepareSpeech("I played C5 → D4.")).toBe("I played C 5 to D 4.");
    expect(prepareSpeech("e3 to f4")).toBe("E 3 to F 4");
    expect(prepareSpeech("AI played F4 → H2 ×1")).toBe("AI played F 4 to H 2");
    expect(prepareSpeech("Row 9 and I2 stay as they are")).toBe("Row 9 and I2 stay as they are");
  });

  it("removes symbols that mean nothing out loud", () => {
    expect(prepareSpeech("King ♛ me * now # please")).toBe("King me now please");
  });

  it("reads the line after the dash rule exactly, only changing how it is said", () => {
    const shown = withoutDashes("Easy-peasy — that was a blunder, lol");
    expect(prepareSpeech(shown)).toBe(shown.replace("lol", "L O L"));
    expect(prepareSpeech(shown)).not.toMatch(/[‐-―-]/);
  });

  it("cuts very long text at a word and tidies spaces", () => {
    const long = "word ".repeat(200);
    const spoken = prepareSpeech(long);
    expect(spoken.length).toBeLessThanOrEqual(MAX_SPEECH_LENGTH);
    expect(spoken.endsWith("word")).toBe(true);
    expect(prepareSpeech("  a   b  ")).toBe("a b");
    expect(prepareSpeech("😂")).toBe("");
  });
});

describe("voice style per level", () => {
  it("Easy is warmer and a little faster, Strongest lower and slower", () => {
    expect(LEVEL_VOICE[1].rate).toBeGreaterThan(0);
    expect(LEVEL_VOICE[1].pitch).toBeGreaterThan(0);
    expect(LEVEL_VOICE[4].rate).toBeLessThan(0);
    expect(LEVEL_VOICE[4].pitch).toBeLessThan(0);
    expect(voiceStyle(1, 1, 1)).toEqual({ rate: 1.06, pitch: 1.08 });
    expect(voiceStyle(4, 1, 1)).toEqual({ rate: 0.92, pitch: 0.88 });
  });

  it("stays inside the safe range", () => {
    expect(voiceStyle(1, 2, 2)).toEqual({ rate: 2, pitch: 2 });
    expect(voiceStyle(4, 0.5, 0.5)).toEqual({ rate: 0.5, pitch: 0.5 });
  });
});

const voice = (name: string, lang: string, extra: Partial<{ default: boolean }> = {}) => ({ name, lang, voiceURI: `uri:${name}`, localService: true, default: false, ...extra });

describe("voice choice", () => {
  const voices = [
    voice("Microsoft David", "en-US", { default: true }),
    voice("Google Deutsch", "de-DE"),
    voice("Microsoft Aria Online (Natural)", "en-US"),
    voice("Daniel", "en-GB"),
  ];

  it("prefers the player's choice when the device has it", () => {
    expect(pickVoice(voices, "uri:Daniel")!.name).toBe("Daniel");
  });

  it("otherwise the best English voice: Natural, Neural, Online, Google or Enhanced first", () => {
    expect(pickVoice(voices, null)!.name).toBe("Microsoft Aria Online (Natural)");
    expect(pickVoice(voices, "uri:gone")!.name).toBe("Microsoft Aria Online (Natural)");
    expect(pickVoice([voice("Karen", "en-AU"), voice("Samantha", "en-US")], null)!.name).toBe("Samantha");
    expect(pickVoice([voice("Google Deutsch", "de-DE")], null)!.name).toBe("Google Deutsch");
    expect(pickVoice([], null)).toBeNull();
  });
});

// A fake speechSynthesis and utterance.
class FakeUtterance {
  voice: unknown = null;
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

const fakeSynth = (voices = [voice("Microsoft Aria Online (Natural)", "en-US")]) => {
  const spoken: FakeUtterance[] = [];
  const synth = {
    spoken,
    cancelled: 0,
    speaking: false,
    speak: (u: FakeUtterance) => void spoken.push(u),
    cancel: () => void synth.cancelled++,
    getVoices: () => voices,
  };
  return synth;
};

const voiceOn = (patch: Partial<Settings["voice"]> = {}): Settings["voice"] => ({ ...defaultSettings(false).voice, enabled: true, ...patch });

const setup = (options: { hidden?: boolean; interacted?: boolean; voices?: ReturnType<typeof voice>[] } = {}) => {
  const synth = fakeSynth(options.voices);
  const speaking = vi.fn();
  const engine = createVoiceEngine({
    synth: synth as unknown as SynthLike,
    createUtterance: (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
    isHidden: () => options.hidden ?? false,
    hasInteracted: () => options.interacted ?? true,
    onSpeaking: speaking,
  });
  return { synth, engine, speaking };
};

describe("voice engine", () => {
  it("is off by default and then never speaks", () => {
    const { synth, engine } = setup();
    expect(defaultSettings(false).voice.enabled).toBe(false);
    expect(engine.speak("Hello", 2, defaultSettings(false).voice)).toBe(false);
    expect(synth.spoken).toHaveLength(0);
  });

  it("never speaks before the player has interacted, or while the page is hidden", () => {
    expect(setup({ interacted: false }).engine.speak("Hello", 2, voiceOn())).toBe(false);
    const hidden = setup({ hidden: true });
    expect(hidden.engine.speak("Hello", 2, voiceOn())).toBe(false);
    expect(hidden.synth.spoken).toHaveLength(0);
  });

  it("speaks the prepared text with the chosen voice, the level's style and the volume", () => {
    const { synth, engine } = setup();
    expect(engine.speak("I played C5 → D4, lol", 4, voiceOn({ volume: 0.7 }))).toBe(true);
    const u = synth.spoken[0]!;
    expect(u.text).toBe("I played C 5 to D 4, L O L");
    expect((u.voice as { name: string }).name).toBe("Microsoft Aria Online (Natural)");
    expect(u.lang).toBe("en-US");
    expect([u.rate, u.pitch, u.volume]).toEqual([0.92, 0.88, 0.7]);
  });

  it("only the latest message: it cancels what is speaking first, no queue", () => {
    const { synth, engine } = setup();
    engine.speak("First", 2, voiceOn());
    engine.speak("Second", 2, voiceOn());
    expect(synth.cancelled).toBe(2);
    expect(synth.spoken.map((u) => u.text)).toEqual(["First", "Second"]);
  });

  it("cancels on demand (a new move, New game) and restores the effects", () => {
    const { synth, engine, speaking } = setup();
    engine.speak("Your move", 2, voiceOn());
    expect(speaking).toHaveBeenLastCalledWith(true);
    engine.cancel();
    expect(synth.cancelled).toBeGreaterThanOrEqual(2);
    expect(speaking).toHaveBeenLastCalledWith(false);
  });

  it("lowers the effects while it speaks and restores them when it ends", () => {
    const { synth, engine, speaking } = setup();
    engine.speak("Hello", 2, voiceOn());
    expect(speaking).toHaveBeenLastCalledWith(true);
    synth.spoken[0]!.onend!();
    expect(speaking).toHaveBeenLastCalledWith(false);
    expect(DUCK_LEVEL).toBeGreaterThan(0);
    expect(DUCK_LEVEL).toBeLessThan(1);
  });

  it("an old line ending late does not restore the effects under a newer one", () => {
    const { synth, engine, speaking } = setup();
    engine.speak("First", 2, voiceOn());
    engine.speak("Second", 2, voiceOn());
    speaking.mockClear();
    synth.spoken[0]!.onend!(); // the cancelled first line reports its end
    expect(speaking).not.toHaveBeenCalled();
  });

  it("says nothing for text that is only emoji", () => {
    const { synth, engine } = setup();
    expect(engine.speak("😂👍", 2, voiceOn())).toBe(false);
    expect(synth.spoken).toHaveLength(0);
  });

  it("is unavailable without speech or without any voice", () => {
    expect(createVoiceEngine({ synth: null, createUtterance: null }).available()).toBe(false);
    expect(createVoiceEngine({ synth: null, createUtterance: null }).speak("Hi", 2, voiceOn())).toBe(false);
    expect(setup({ voices: [] }).engine.available()).toBe(false);
    expect(setup().engine.available()).toBe(true);
  });

  it("unlock speaks one silent warm up line, once (iOS needs it inside a tap)", () => {
    const { synth, engine } = setup();
    engine.unlock();
    engine.unlock();
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0]!.volume).toBe(0);
  });
});

describe("which reading switch a bubble line uses", () => {
  const msg = (key: string, text: string | null = "Hi") => ({ key, text, tone: "banter" as const, why: false });

  it("greetings, idle lines and reactions; never the typing dots", () => {
    expect(bubbleKind(msg("greeting"))).toBe("greetings");
    expect(bubbleKind(msg("idle-3-1"))).toBe("idle");
    expect(bubbleKind(msg("move-4"))).toBe("reactions");
    expect(bubbleKind(msg("hint-6"))).toBe("reactions");
    expect(bubbleKind(msg("thinking-2", null))).toBeNull();
    expect(bubbleKind(null)).toBeNull();
  });

  it("defaults: reactions, greetings and the game over taunt on; idle and Tips and Why off", () => {
    expect(defaultSettings(false).voice.read).toEqual({ reactions: true, greetings: true, gameOver: true, idle: false, tips: false });
  });
});
