import { promptForContext } from "../../src/ai/request";
import type { ModelContext } from "../../src/ai/request";
import { callProvider } from "./adapter";
import type { CooldownStore } from "./cooldowns";
import { cooldownUntil } from "./cooldowns";
import type { Env, Provider } from "./providers";
import { providerOrder } from "./ranking";
import type { ModelMeasurement } from "./ranking";
export const CHAIN_BUDGET_MS = 10000; // Leaves transport/search room in the 12s turn.
export type ChainResult = { text: string; provider: string; attempts: number } | { fallback: true; attempts: number };
export interface ChainDeps {
  env: Env;
  providers: readonly Provider[];
  store: CooldownStore;
  fetch: typeof fetch;
  measurements?: readonly ModelMeasurement[];
  now?: () => number;
  budgetMs?: number;
  log?: (entry: { provider: string; code: string; attempts: number }) => void;
}
export async function runChain(context: ModelContext, deps: ChainDeps): Promise<ChainResult> {
  const now = deps.now ?? Date.now;
  const deadline = now() + Math.min(CHAIN_BUDGET_MS, deps.budgetMs ?? CHAIN_BUDGET_MS);
  const ordered = providerOrder(deps.providers, context, deps.env, deps.measurements);
  if (ordered.length === 0) return { fallback: true, attempts: 0 };
  const cooling = new Map(await deps.store.read(Math.max(0, deadline - now())));
  const prompt = promptForContext(context);
  let attempts = 0;
  for (const p of ordered) {
    if (!deps.env[p.keyEnv]?.trim() || (cooling.get(p.group)?.cooldownUntil ?? 0) > now()) continue;
    const remaining = deadline - now();
    if (remaining <= 0) break;
    attempts++;
    const answer = await callProvider(p, deps.env, prompt, context.job, context.candidates.length, deps.fetch, Math.min(p.timeoutMs, remaining), now, context);
    if (answer.ok) return { text: answer.text, provider: p.id, attempts };
    deps.log?.({ provider: p.id, code: answer.code, attempts });
    if ([402, 429].includes(answer.status ?? 0)) {
      const row = { provider: p.group, cooldownUntil: cooldownUntil(p, answer.headers, answer.body, now()), lastErrorCode: answer.code, updatedAt: now() };
      cooling.set(p.group, row);
      await deps.store.cool(row, Math.max(0, deadline - now()));
    }
    // A failed provider never sleeps in a player request. Different provider
    // groups can serve immediately while this account waits for its reset.
  }
  return { fallback: true, attempts };
}
