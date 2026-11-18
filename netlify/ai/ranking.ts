import type { ModelContext } from "../../src/ai/request";
import type { Env, Provider } from "./providers";
import { FAST_BOOTSTRAP, QUALITY_BOOTSTRAP } from "./providers";
export interface ModelMeasurement {
  id: string;
  model: string;
  complete: boolean;
  samples: number;
  validRate: number;
  topRate: number;
  bestRate: number;
  truthRate: number;
  tauntRate: number;
  medianMs: number;
  slowestMs: number;
  averageTokens: number | null;
  moveMedianMs?: number;
  tauntMedianMs?: number;
}
export function moveScore(m: ModelMeasurement): number { return 100 * (0.3 * m.validRate + 0.2 * m.topRate + 0.3 * m.bestRate + 0.2 * m.truthRate); }
export function tauntScore(m: ModelMeasurement): number { return 100 * (0.75 * m.tauntRate + 0.25 * Math.max(0, 1 - (m.tauntMedianMs ?? m.medianMs) / 4000)); }

export function providerOrder(providers: readonly Provider[], context: Pick<ModelContext, "job" | "level" | "opening">, env: Env, measured: readonly ModelMeasurement[] = []): Provider[] {
  const quality = context.job === "move" && (context.opening || context.level >= 3);
  const bootstrap = quality ? QUALITY_BOOTSTRAP : FAST_BOOTSTRAP;
  const eligible = (p: Provider) => measured.find(m => m.id === p.id && m.model === p.model && m.complete && m.samples >= 40);
  const order = [...providers].sort((a, b) => {
    const am = eligible(a), bm = eligible(b);
    const latency = (m: ModelMeasurement) => (context.job === "move" ? m.moveMedianMs : m.tauntMedianMs) ?? m.medianMs;
    const slowA = am !== undefined && latency(am) >= a.timeoutMs;
    const slowB = bm !== undefined && latency(bm) >= b.timeoutMs;
    if (slowA !== slowB) return slowA ? 1 : -1;
    // Preserve quality-model quota for difficult moves. Scores choose within
    // each tier; heavy models remain available when the lightweight tier fails.
    if (!quality && (a.tier === "fast") !== (b.tier === "fast")) return a.tier === "fast" ? -1 : 1;
    if (am && bm) return (quality ? moveScore(bm) - moveScore(am) : tauntScore(bm) - tauntScore(am)) || am.medianMs - bm.medianMs;
    if (Boolean(am) !== Boolean(bm)) return am ? -1 : 1;
    const rank = (id: string) => bootstrap.includes(id) ? bootstrap.indexOf(id) : bootstrap.length;
    return rank(a.id) - rank(b.id);
  });
  const override = (context.job === "taunt" ? env.AI_TAUNT_PROVIDER_ORDER : quality ? env.AI_MOVE_PROVIDER_ORDER : env.AI_FAST_PROVIDER_ORDER)?.trim() || env.AI_PROVIDER_ORDER;
  if (!override) return order;
  const ids = [...new Set(override.split(",").map(s => s.trim()).filter(Boolean))];
  return [...ids.flatMap(id => order.filter(p => p.id === id)), ...order.filter(p => !ids.includes(p.id))];
}
