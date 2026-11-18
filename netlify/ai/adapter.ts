import { parseReply } from "../../src/ai/parseReply";
import { validChatLine } from "../../src/ai/chat";
import type { ChatContext } from "../../src/ai/chat";
import type { AiJob } from "../../src/ai/request";
import { DeadlineError, within } from "./deadline";
import type { Env, Provider } from "./providers";
export const OUTPUT_TOKEN_CAP = 768; // Includes reasoning; never add it twice.
export interface TokenUsage { input: number; output: number; reasoning: number; total: number }
export type AdapterResult = { ok: true; text: string; usage: TokenUsage | null; elapsedMs: number } | { ok: false; code: string; status?: number; headers: Headers; body?: unknown; usage?: TokenUsage | null; replyBytes?: number; elapsedMs: number };

export function validTaunt(text: string, context?: ChatContext): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    const line = (parsed as { reaction?: unknown } | null)?.reaction;
    return typeof line === "string" && validChatLine(line, context);
  } catch { return false; }
}
export function validReply(text: string, job: AiJob, candidateCount: number, context?: ChatContext): boolean {
  return job === "move" ? parseReply(text, candidateCount).ok : validTaunt(text, context);
}
function usageOf(data: unknown): TokenUsage | null {
  const u = (data as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } } } | null)?.usage;
  if (!u || typeof u.prompt_tokens !== "number" || typeof u.completion_tokens !== "number") return null;
  const input = u.prompt_tokens, output = u.completion_tokens;
  const reasoning = typeof u.completion_tokens_details?.reasoning_tokens === "number" ? u.completion_tokens_details.reasoning_tokens : 0;
  const total = typeof u.total_tokens === "number" ? u.total_tokens : input + output;
  if (![input, output, reasoning, total].every(n => Number.isFinite(n) && n >= 0) || total < input + output || reasoning > output) return null;
  return { input, output, reasoning, total };
}

export async function callProvider(p: Provider, env: Env, prompt: string, job: AiJob, candidateCount: number, send: typeof fetch, timeoutMs = p.timeoutMs, now = Date.now, context?: ChatContext): Promise<AdapterResult> {
  const start = now();
  try {
    return await within(timeoutMs, async signal => {
      const response = await send(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST", signal,
        headers: { Authorization: `Bearer ${env[p.keyEnv] ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...p.extra, model: p.model, messages: [{ role: "user", content: prompt }], max_tokens: OUTPUT_TOKEN_CAP, stream: false }),
      });
      // Read only inside the attempt deadline, and never log this content.
      const raw = await response.text();
      let data: unknown;
      try { data = raw.length <= 100000 ? JSON.parse(raw) : null; } catch { data = null; }
      const embedded = (data as { error?: { code?: unknown } } | null)?.error;
      const errorCode = Number(embedded?.code);
      const status = !response.ok ? response.status : embedded ? Number.isInteger(errorCode) && errorCode >= 400 && errorCode < 600 ? errorCode : 502 : undefined;
      if (status !== undefined) return { ok: false, code: String(status), status, headers: response.headers, body: data ?? raw.slice(0, 20000), elapsedMs: now() - start };
      const content = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
      const echoedCredential = typeof content === "string" && Boolean(env[p.keyEnv] && content.includes(env[p.keyEnv]!));
      if (typeof content !== "string" || content.length > 10000 || echoedCredential || !validReply(content, job, candidateCount, context)) return { ok: false, code: "INVALID_REPLY", headers: response.headers, usage: usageOf(data), replyBytes: typeof content === "string" ? new TextEncoder().encode(content).length : 0, elapsedMs: now() - start };
      return { ok: true, text: content, usage: usageOf(data), elapsedMs: now() - start };
    });
  } catch (error) {
    return { ok: false, code: error instanceof DeadlineError ? "TIMEOUT" : "NETWORK", headers: new Headers(), elapsedMs: now() - start };
  }
}
