import { createCallModel } from "./client";
import type { CallModel } from "./chooseMove";
import { normaliseLine, validChatLine } from "./chat";
import type { ChatContext } from "./chat";
import type { ModelContext, TauntEvent } from "./request";

export function tauntEvent(key: string, rematch = false): TauntEvent {
  if (key === "greeting") return rematch ? "rematch" : "start";
  if (key.startsWith("end-")) return "end";
  if (key.startsWith("idle-")) return "idle";
  if (key.startsWith("hint-") || key.startsWith("push-")) return "resign";
  return "during";
}
export function readTaunt(text: string, context?: ChatContext): string | null {
  try {
    const value: unknown = JSON.parse(text);
    const line = (value as { reaction?: unknown } | null)?.reaction;
    // The line as players see it (D158): straight quotes, a capital first letter.
    return typeof line === "string" && validChatLine(line, context) ? normaliseLine(line) : null;
  } catch { return null; }
}
const remoteTaunt = createCallModel({ chain: true });
export async function requestTaunt(context: ModelContext, signal?: AbortSignal, call: CallModel = remoteTaunt): Promise<string | null> {
  try { return readTaunt(await call("", undefined, signal, { ...context, job: "taunt", candidates: [], scores: undefined }), context); }
  catch { return null; } // A local bank line is already on screen.
}
