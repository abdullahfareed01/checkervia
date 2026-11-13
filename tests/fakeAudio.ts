// A fake AudioContext for the sound engine's tests: it records every node,
// every scheduled value and every start and stop, so the tests can check
// envelopes, limits and variation without a browser or speakers.
import type { AudioContextLike } from "../src/ui/sound/soundEngine";

export interface ParamEvent {
  kind: "set" | "linear" | "exp" | "target";
  value: number;
  time: number;
}

export class FakeParam {
  value = 0;
  events: ParamEvent[] = [];
  setValueAtTime(value: number, time: number) {
    this.events.push({ kind: "set", value, time });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: "linear", value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: "exp", value, time });
    return this;
  }
  setTargetAtTime(value: number, time: number) {
    this.events.push({ kind: "target", value, time });
    this.value = value;
    return this;
  }
}

export class FakeNode {
  connections: unknown[] = [];
  started: number[] = [];
  stopped: number[] = [];
  gain = new FakeParam();
  pan = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  playbackRate = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  type = "";
  buffer: unknown = null;
  constructor(readonly kind: string) {}
  connect(target: unknown) {
    this.connections.push(target);
    return target;
  }
  start(time = 0) {
    this.started.push(time);
  }
  stop(time = 0) {
    this.stopped.push(time);
  }
}

export class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = "running";
  sampleRate = 1000;
  destination = new FakeNode("destination");
  nodes: FakeNode[] = [];
  resumed = 0;

  private make(kind: string) {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
  resume() {
    this.resumed += 1;
    this.state = "running";
    return Promise.resolve();
  }
  createGain() {
    return this.make("gain");
  }
  createOscillator() {
    return this.make("oscillator");
  }
  createBiquadFilter() {
    return this.make("filter");
  }
  createBufferSource() {
    return this.make("source");
  }
  createStereoPanner() {
    return this.make("panner");
  }
  createDynamicsCompressor() {
    return this.make("compressor");
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { duration: length / this.sampleRate, getChannelData: () => data };
  }
  ofKind(kind: string) {
    return this.nodes.filter((node) => node.kind === kind);
  }
  asContext(): AudioContextLike {
    return this as unknown as AudioContextLike;
  }
}
