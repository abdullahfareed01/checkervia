// Phase A: the settings store, the sound engine, the haptics engine and the
// event to sound and vibration map, with fakes for AudioContext, storage and
// navigator.vibrate.
import { describe, expect, it, vi } from "vitest";
import { at, boardFrom } from "../src/engine/testUtils";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameState } from "../src/state/gameReducer";
import { FEEDBACK, FINAL_HOP_HAPTIC, HOP_PITCH_STEP, clickFeedback, moveFeedback, planFeedback } from "../src/ui/feedback";
import type { FeedbackEvent } from "../src/ui/feedback";
import { HAPTIC_SCALE, createHaptics, isAppleTouchDevice, scalePattern } from "../src/ui/haptics";
import { SETTINGS_KEY, SETTINGS_VERSION, createSettingsStore, defaultSettings, parseSettings } from "../src/ui/settings";
import type { Settings } from "../src/ui/settings";
import { LONG_SOUNDS, MAX_LONG_SOUND_MS, MAX_PAN, MAX_SOUND_MS, MAX_VOICES, PITCH_VARIATION, SOUNDS, VOLUME_VARIATION, soundLength } from "../src/ui/sound/soundConfig";
import type { SoundName } from "../src/ui/sound/soundConfig";
import { columnPan, createSoundEngine, vary } from "../src/ui/sound/soundEngine";
import { FakeAudioContext } from "./fakeAudio";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};

// ---------- Settings ----------

describe("settings store", () => {
  it("has the asked for defaults", () => {
    const d = defaultSettings(false);
    expect(d.sound).toEqual({ enabled: true, volume: 0.6, effects: true, interface: true });
    expect(d.haptics).toBe("standard");
    expect(d.voice.enabled).toBe(false);
    expect(d.voice.read).toEqual({ reactions: true, greetings: true, gameOver: true, idle: false, tips: false });
    expect(d.animation).toEqual({ level: "standard", speed: 1 });
    expect(d.board).toEqual({ theme: "classic", pieces: "classic", coordinates: "squares", legalMoves: true, lastMove: true });
    expect(d.chat.bubbles).toBe(true);
  });

  it("defaults to Reduced animation when the system prefers reduced motion", () => {
    expect(defaultSettings(true).animation.level).toBe("reduced");
    expect(createSettingsStore({ storage: memoryStorage(), prefersReducedMotion: true }).get().animation.level).toBe("reduced");
  });

  it("saves a change and loads it again", () => {
    const storage = memoryStorage();
    const store = createSettingsStore({ storage, prefersReducedMotion: false });
    store.update((s) => ({ ...s, sound: { ...s.sound, volume: 0.25 }, haptics: "strong" }));
    expect(JSON.parse(storage.data.get(SETTINGS_KEY)!).version).toBe(SETTINGS_VERSION);
    const again = createSettingsStore({ storage, prefersReducedMotion: false });
    expect(again.get().sound.volume).toBe(0.25);
    expect(again.get().haptics).toBe("strong");
  });

  it("tells subscribers about changes, until they unsubscribe", () => {
    const store = createSettingsStore({ storage: memoryStorage(), prefersReducedMotion: false });
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.update((s) => ({ ...s, haptics: "light" }));
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    store.update((s) => ({ ...s, haptics: "off" }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("falls back to the defaults on corrupt data or another version", () => {
    const d = defaultSettings(false);
    expect(parseSettings("{not json", d)).toEqual(d);
    expect(parseSettings("[]", d)).toEqual(d);
    expect(parseSettings(JSON.stringify({ version: 0, haptics: "off" }), d)).toEqual(d);
    expect(parseSettings(JSON.stringify({ version: SETTINGS_VERSION + 1, haptics: "off" }), d)).toEqual(d);
    expect(createSettingsStore({ storage: memoryStorage({ [SETTINGS_KEY]: "garbage" }), prefersReducedMotion: false }).get()).toEqual(d);
  });

  it("replaces only the broken fields", () => {
    const d = defaultSettings(false);
    const loaded = parseSettings(
      JSON.stringify({ version: SETTINGS_VERSION, sound: { volume: 7, enabled: false }, haptics: "loud", animation: { level: "cinematic", speed: 9 } }),
      d,
    );
    expect(loaded.sound.volume).toBe(d.sound.volume); // out of range
    expect(loaded.sound.enabled).toBe(false); // valid, kept
    expect(loaded.haptics).toBe(d.haptics); // unknown value
    expect(loaded.animation).toEqual({ level: "cinematic", speed: d.animation.speed });
  });

  it("checks changes too, and resets to the defaults", () => {
    const storage = memoryStorage();
    const store = createSettingsStore({ storage, prefersReducedMotion: false });
    store.update((s) => ({ ...s, sound: { ...s.sound, volume: -3 } }) as Settings);
    expect(store.get().sound.volume).toBe(0.6);
    store.update((s) => ({ ...s, haptics: "off" }));
    store.reset();
    expect(store.get()).toEqual(defaultSettings(false));
    expect(storage.data.has(SETTINGS_KEY)).toBe(false);
  });

  it("still works when storage throws (private mode)", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    const store = createSettingsStore({ storage: broken, prefersReducedMotion: false });
    store.update((s) => ({ ...s, haptics: "light" }));
    expect(store.get().haptics).toBe("light");
  });
});

// ---------- Sound config ----------

describe("sound config", () => {
  const names = Object.keys(SOUNDS) as SoundName[];

  it.each(names)("%s is short enough and starts with a fade in", (name) => {
    const limit = LONG_SOUNDS.includes(name) ? MAX_LONG_SOUND_MS : MAX_SOUND_MS;
    expect(soundLength(SOUNDS[name])).toBeLessThan(limit);
    for (const layer of SOUNDS[name].layers) {
      expect(layer.attack).toBeGreaterThanOrEqual(1);
      expect(layer.gain).toBeGreaterThan(0);
      expect(layer.gain).toBeLessThanOrEqual(1);
    }
  });

  it("wood clacks sit in the 2 to 4 kHz band with a 180 to 260 Hz body", () => {
    for (const name of ["clack", "clackHeavy", "hop"] as const) {
      const layers = SOUNDS[name].layers;
      expect(layers.some((l) => l.kind === "noise" && l.freq >= 2000 && l.freq <= 4000)).toBe(true);
      expect(layers.some((l) => l.kind === "tone" && l.freq >= 180 && l.freq <= 260)).toBe(true);
    }
  });
});

// ---------- Sound engine ----------

const setup = (random = () => 0.5, hidden = false) => {
  const fake = new FakeAudioContext();
  const engine = createSoundEngine({ createContext: () => fake.asContext(), random, isHidden: () => hidden });
  return { fake, engine };
};

describe("sound engine", () => {
  it("stays silent until unlocked by a gesture", () => {
    const { fake, engine } = setup();
    expect(engine.play("clack")).toBe(false);
    expect(fake.nodes).toHaveLength(0);
    engine.unlock();
    expect(engine.play("clack")).toBe(true);
  });

  it("resumes a suspended context (iOS) on unlock and on play", () => {
    const { fake, engine } = setup();
    fake.state = "suspended";
    engine.unlock();
    expect(fake.resumed).toBe(1);
    fake.state = "suspended";
    engine.play("tick");
    expect(fake.resumed).toBe(2);
  });

  it("is silent while the page is hidden", () => {
    const { fake, engine } = setup(() => 0.5, true);
    engine.unlock();
    const before = fake.nodes.length;
    expect(engine.play("clack")).toBe(false);
    expect(fake.nodes.length).toBe(before);
  });

  it("goes through a master gain and a limiter to the speakers", () => {
    const { fake, engine } = setup();
    engine.unlock();
    const [limiter] = fake.ofKind("compressor");
    expect(limiter!.connections).toEqual([fake.destination]);
    expect(limiter!.ratio.value).toBeGreaterThanOrEqual(10);
    const master = fake.ofKind("gain")[0]!;
    expect(master.connections).toEqual([limiter]);
  });

  it("plays at most 6 sounds at once and skips the rest", () => {
    const { fake, engine } = setup();
    engine.unlock();
    const results = Array.from({ length: 9 }, () => engine.play("clack"));
    expect(results.filter(Boolean)).toHaveLength(MAX_VOICES);
    expect(engine.activeVoices()).toBe(MAX_VOICES);
    fake.currentTime = 1; // they have all ended
    expect(engine.activeVoices()).toBe(0);
    expect(engine.play("clack")).toBe(true);
  });

  it("fades every layer in from 0 and out to near silence, and stops it after", () => {
    const { fake, engine } = setup();
    engine.unlock();
    const before = fake.nodes.length;
    engine.play("clackHeavy");
    const created = fake.nodes.slice(before);
    const envelopes = created.filter((n) => n.kind === "gain" && n.gain.events.length > 0);
    expect(envelopes.length).toBe(SOUNDS.clackHeavy.layers.length);
    for (const env of envelopes) {
      expect(env.gain.events[0]).toMatchObject({ kind: "set", value: 0 });
      expect(env.gain.events[1]!.kind).toBe("linear");
      const last = env.gain.events.at(-1)!;
      expect(last.kind).toBe("exp");
      expect(last.value).toBeLessThan(0.001);
    }
    const sources = created.filter((n) => n.kind === "oscillator" || n.kind === "source");
    for (const source of sources) expect(source.stopped[0]!).toBeGreaterThan(source.started[0]!);
  });

  it("varies pitch by at most 3 percent and volume by at most 5 percent", () => {
    expect(vary(() => 0, PITCH_VARIATION)).toBeCloseTo(0.97);
    expect(vary(() => 1, PITCH_VARIATION)).toBeCloseTo(1.03);
    expect(vary(() => 0, VOLUME_VARIATION)).toBeCloseTo(0.95);
    expect(vary(() => 1, VOLUME_VARIATION)).toBeCloseTo(1.05);
    for (const r of [0, 0.25, 0.5, 0.99]) {
      const { fake, engine } = setup(() => r);
      engine.unlock();
      const before = fake.nodes.length;
      engine.play("tickSoft");
      const osc = fake.nodes.slice(before).find((n) => n.kind === "oscillator")!;
      const pitch = osc.frequency.events[0]!.value / SOUNDS.tickSoft.layers[0]!.freq;
      expect(Math.abs(pitch - 1)).toBeLessThanOrEqual(PITCH_VARIATION + 1e-9);
      const voice = fake.nodes.slice(before).find((n) => n.kind === "gain")!;
      expect(Math.abs(voice.gain.value / SOUNDS.tickSoft.gain - 1)).toBeLessThanOrEqual(VOLUME_VARIATION + 1e-9);
    }
  });

  it("pans by board column, gently (at most 0.3)", () => {
    expect(columnPan(0)).toBe(-1);
    expect(columnPan(7)).toBe(1);
    const { fake, engine } = setup();
    engine.unlock();
    engine.play("clack", { pan: columnPan(0) });
    expect(fake.ofKind("panner").at(-1)!.pan.value).toBeCloseTo(-MAX_PAN);
    engine.play("clack", { pan: 5 });
    expect(fake.ofKind("panner").at(-1)!.pan.value).toBeCloseTo(MAX_PAN);
  });

  it("sets and lowers (ducks) the master volume smoothly", () => {
    const { fake, engine } = setup();
    engine.unlock();
    const master = fake.ofKind("gain")[0]!;
    engine.setVolume(0.8);
    engine.setDuck(0.4);
    expect(master.gain.events.at(-1)).toMatchObject({ kind: "target" });
    expect(master.gain.value).toBeCloseTo(0.32);
  });

  it("can use a recording instead, without changing the caller", async () => {
    const fake = new FakeAudioContext();
    const recording = { duration: 0.2 } as AudioBuffer;
    const loadFile = vi.fn(() => Promise.resolve(recording));
    const engine = createSoundEngine({
      createContext: () => fake.asContext(),
      random: () => 0.5,
      loadFile,
      sounds: { ...SOUNDS, clack: { ...SOUNDS.clack, file: "/sounds/clack.mp3" } },
    });
    engine.unlock();
    engine.play("clack"); // synthesized while the file loads
    expect(loadFile).toHaveBeenCalledWith(expect.anything(), "/sounds/clack.mp3");
    await Promise.resolve();
    await Promise.resolve();
    const before = fake.nodes.length;
    engine.play("clack");
    const sources = fake.nodes.slice(before).filter((n) => n.kind === "source");
    expect(sources).toHaveLength(1);
    expect(sources[0]!.buffer).toBe(recording);
    expect(fake.nodes.slice(before).some((n) => n.kind === "oscillator")).toBe(false);
  });
});

// ---------- Haptics ----------

describe("haptics engine", () => {
  it("scales the vibrations by intensity, keeping the pauses", () => {
    expect(HAPTIC_SCALE).toEqual({ off: 0, light: 0.6, standard: 1, strong: 1.5 });
    expect(scalePattern([20, 40, 30], "light")).toEqual([12, 40, 18]);
    expect(scalePattern([20, 40, 30], "standard")).toEqual([20, 40, 30]);
    expect(scalePattern([20, 40, 30], "strong")).toEqual([30, 40, 45]);
  });

  it("vibrates only when supported, on, and the page is visible", () => {
    const vibrate = vi.fn(() => true);
    let hidden = false;
    const h = createHaptics({ vibrate, isHidden: () => hidden });
    expect(h.supported).toBe(true);
    expect(h.pulse([12], "standard")).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith([12]);
    expect(h.pulse([12], "off")).toBe(false);
    hidden = true;
    expect(h.pulse([12], "standard")).toBe(false);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(createHaptics({ vibrate: null }).supported).toBe(false);
    expect(createHaptics({ vibrate: null }).pulse([12], "strong")).toBe(false);
  });

  it("survives a browser that throws on vibrate", () => {
    const h = createHaptics({ vibrate: () => { throw new Error("blocked"); } });
    expect(h.pulse([8], "standard")).toBe(false);
  });

  it("treats iPhone and iPad as unsupported, even if vibrate exists there", () => {
    expect(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 })).toBe(true); // iPad
    expect(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 })).toBe(false); // a Mac
    expect(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)", maxTouchPoints: 5 })).toBe(false);
  });
});

// ---------- Events to sounds and vibrations ----------

describe("event map", () => {
  const settings = defaultSettings(false);
  // The owner's table: sound and vibration pattern for every event.
  const expected: Record<FeedbackEvent, [SoundName, number[] | null]> = {
    select: ["tick", [8]],
    deselect: ["tickSoft", null],
    move: ["clack", [12]],
    capture: ["clackHeavy", [25]],
    hop: ["hop", [10]],
    crown: ["crown", [20, 40, 30]],
    invalid: ["thud", [15, 40, 15]],
    captureRequired: ["thud", [10, 30, 10]],
    aiBubble: ["pop", null],
    idleBubble: ["pop", null],
    gameStart: ["settle", null],
    win: ["win", [30, 60, 30, 60, 80]],
    loss: ["loss", [60]],
    resign: ["resign", [40]],
    button: ["click", [6]],
    toggle: ["toggle", [8]],
    sheet: ["whoosh", null],
    consent: ["confirm", [10]],
    error: ["error", [20, 50, 20]],
  };

  it.each(Object.entries(expected))("%s", (event, [sound, haptic]) => {
    const plan = planFeedback(event as FeedbackEvent, {}, settings);
    expect(plan.sound?.name).toBe(sound);
    expect(plan.haptic).toEqual(haptic);
  });

  it("softer variants: the capture rule tap and the idle bubble are quieter", () => {
    expect(planFeedback("captureRequired", {}, settings).sound!.options.gain).toBeLessThan(planFeedback("invalid", {}, settings).sound!.options.gain!);
    expect(planFeedback("idleBubble", {}, settings).sound!.options.gain).toBeLessThan(planFeedback("aiBubble", {}, settings).sound!.options.gain!);
  });

  it("multi jump hops rise in pitch, and the last one vibrates harder", () => {
    expect(planFeedback("hop", { hop: 0 }, settings).sound!.options.pitch).toBe(1);
    expect(planFeedback("hop", { hop: 2 }, settings).sound!.options.pitch).toBeCloseTo(1 + 2 * HOP_PITCH_STEP);
    expect(planFeedback("hop", { hop: 2, finalHop: true }, settings).haptic).toEqual(FINAL_HOP_HAPTIC);
  });

  it("follows the switches: sound off, effects off, interface off, haptics off", () => {
    const off = (patch: Partial<Settings["sound"]>, haptics: Settings["haptics"] = "standard") =>
      ({ ...settings, sound: { ...settings.sound, ...patch }, haptics }) as Settings;
    expect(planFeedback("move", {}, off({ enabled: false })).sound).toBeNull();
    expect(planFeedback("move", {}, off({ volume: 0 })).sound).toBeNull();
    expect(planFeedback("move", {}, off({ effects: false })).sound).toBeNull();
    expect(planFeedback("button", {}, off({ effects: false })).sound).not.toBeNull();
    expect(planFeedback("button", {}, off({ interface: false })).sound).toBeNull();
    expect(planFeedback("move", {}, off({}, "off")).haptic).toBeNull();
    expect(planFeedback("move", {}, off({ enabled: false })).haptic).toEqual([12]); // vibration is its own switch
  });

  it("turn changes and the AI thinking have no event at all", () => {
    expect(Object.keys(FEEDBACK)).not.toContain("turn");
    expect(Object.keys(FEEDBACK)).not.toContain("thinking");
  });
});

describe("which event a board click is", () => {
  const click = (state: GameState, row: number, col: number) => {
    const after = gameReducer(state, { type: "click", position: at(row, col) });
    return { event: clickFeedback(state, after, at(row, col)), after };
  };
  const start = createGameState({ mode: "two-player" });

  it("picking up a piece, putting it down, and a piece that cannot move", () => {
    const picked = click(start, 5, 0); // a Black piece with a move
    expect(picked.event).toBe("select");
    expect(click(picked.after, 5, 0).event).toBe("deselect");
    expect(click(start, 7, 0).event).toBe("invalid"); // blocked in the back row
    expect(click(start, 2, 1).event).toBe("invalid"); // White's piece on Black's turn
    expect(click(start, 4, 1).event).toBeNull(); // an empty square, nothing picked up
  });

  it("a square the picked up piece cannot reach is an invalid tap", () => {
    const picked = click(start, 5, 0).after;
    expect(click(picked, 3, 0).event).toBe("invalid");
  });

  it("when a capture is mandatory, the softer capture rule tap", () => {
    // Black at (5,2) must jump White at (4,3); Black at (5,6) may not just step.
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "...w....",
      "..b...b.",
      "........",
      "........",
    ]);
    const state = createGameState({ mode: "two-player", board });
    expect(click(state, 5, 6).event).toBe("captureRequired");
    const picked = click(state, 5, 2).after;
    expect(click(picked, 4, 1).event).toBe("captureRequired");
  });

  it("a move makes no click sound (it sounds when the piece lands), and a locked board none", () => {
    const picked = click(start, 5, 0).after;
    expect(click(picked, 4, 1).event).toBeNull();
    const aiTurn = { ...start, aiPhase: "thinking" as const };
    expect(click(aiTurn, 5, 0).event).toBeNull();
  });
});

describe("what a move sounds like", () => {
  it("a step clacks, a single capture clacks heavy, both in the landing column", () => {
    expect(moveFeedback({ from: at(5, 0), to: at(4, 1), path: [at(4, 1)], captured: [] }, false)).toEqual([{ event: "move", options: { column: 1 } }]);
    expect(moveFeedback({ from: at(5, 0), to: at(3, 2), path: [at(3, 2)], captured: [at(4, 1)] }, false)).toEqual([{ event: "capture", options: { column: 2 } }]);
  });

  it("a multi jump gives one rising hop per landing, the last one final, then the crown", () => {
    const move = { from: at(5, 0), to: at(1, 4), path: [at(3, 2), at(1, 4)], captured: [at(4, 1), at(2, 3)] };
    expect(moveFeedback(move, true)).toEqual([
      { event: "hop", options: { column: 2, hop: 0, finalHop: false } },
      { event: "hop", options: { column: 4, hop: 1, finalHop: true } },
      { event: "crown", options: { column: 4 } },
    ]);
  });
});
