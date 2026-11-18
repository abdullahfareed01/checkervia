// Unlike AbortSignal alone, this also bounds a fetch/body reader that ignores
// cancellation (and makes the same guarantee under deterministic fake clocks).
export class DeadlineError extends Error {}
export async function within<T>(ms: number, run: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    abort = () => { controller.abort(); reject(new DeadlineError()); };
    timer = setTimeout(abort, Math.max(0, ms));
    if (parent?.aborted) abort();
    else parent?.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([deadline, Promise.resolve().then(() => run(controller.signal))]); }
  finally {
    clearTimeout(timer);
    if (abort) parent?.removeEventListener("abort", abort);
    controller.abort();
  }
}
