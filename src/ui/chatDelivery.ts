// One event produces one final line. A reply that arrives after the local
// deadline never replaces the fallback or starts a second spoken message.
export const TURN_CUE_MS = 1400;
export const CHAT_TYPING_MS = 1000;
export const CHAT_DEADLINE_MS = 4000;
export interface ChatFrame { phase: "cue" | "typing" | "final"; text: string | null }
export function deliverChat(cue: string | null, fallback: string, request: ((signal: AbortSignal) => Promise<string | null>) | null, show: (frame: ChatFrame) => void): () => void {
  const controller = new AbortController();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let active = true, finished = false, ready = request === null, canReveal = false;
  let answer: string | null = null;
  const later = (run: () => void, delay: number) => timers.push(setTimeout(run, delay));
  const reveal = () => {
    if (!active || finished || !canReveal || !ready) return;
    finished = true;
    for (const timer of timers) clearTimeout(timer);
    controller.abort();
    show({ phase: "final", text: answer || fallback });
  };
  show({ phase: cue ? "cue" : "typing", text: cue });
  if (cue) later(() => { if (active && !finished) show({ phase: "typing", text: null }); }, TURN_CUE_MS);
  later(() => { canReveal = true; reveal(); }, (cue ? TURN_CUE_MS : 0) + CHAT_TYPING_MS);
  later(() => { ready = true; reveal(); }, CHAT_DEADLINE_MS);
  // StrictMode cleans its first effect up before this microtask starts fetch.
  if (request) void Promise.resolve().then(() => active ? request(controller.signal) : null).then(text => {
    if (!active || finished) return;
    answer = text;
    ready = true;
    reveal();
  }).catch(() => { if (active && !finished) { ready = true; reveal(); } });
  return () => { active = false; controller.abort(); for (const timer of timers) clearTimeout(timer); };
}
