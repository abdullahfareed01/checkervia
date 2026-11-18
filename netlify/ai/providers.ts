export type Env = Readonly<Record<string, string | undefined>>;
export type ResetRule = "utc-day" | "pacific-day" | "headers";
export interface Provider {
  id: string;
  group: string;
  baseUrl: string;
  model: string;
  keyEnv: string;
  timeoutMs: number;
  reset: ResetRule;
  tier?: "fast" | "quality";
  rpm?: number;
  rpd?: number;
  tpm?: number;
  tpd?: number;
  inputNeurons?: number;
  outputNeurons?: number;
  extra?: Readonly<Record<string, unknown>>;
}
const common = { timeoutMs: 3500, reset: "headers" as const };
export const FREE_PROVIDERS: readonly Provider[] = [
  { ...common, tier: "fast", id: "groq-small", group: "groq", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-20b", keyEnv: "GROQ_API_KEY", rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000, extra: { reasoning_effort: "low" } },
  { ...common, tier: "quality", id: "groq-large", group: "groq", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", keyEnv: "GROQ_API_KEY", rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000, extra: { reasoning_effort: "low" } },
  { ...common, tier: "fast", id: "cloudflare-small", group: "cloudflare", baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1", model: "@cf/meta/llama-3.1-8b-instruct-fp8-fast", keyEnv: "CLOUDFLARE_API_TOKEN", reset: "utc-day", rpm: 300, inputNeurons: 4119, outputNeurons: 34868 },
  { ...common, tier: "quality", id: "cloudflare-large", group: "cloudflare", baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", keyEnv: "CLOUDFLARE_API_TOKEN", reset: "utc-day", rpm: 300, inputNeurons: 26668, outputNeurons: 204805 },
  { ...common, tier: "quality", id: "sambanova", group: "sambanova", baseUrl: "https://api.sambanova.ai/v1", model: "Meta-Llama-3.3-70B-Instruct", keyEnv: "SAMBANOVA_API_KEY", rpm: 20, rpd: 20, tpd: 200000 },
  { ...common, tier: "quality", id: "openrouter", group: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/free", keyEnv: "OPENROUTER_API_KEY", reset: "utc-day", rpm: 20, rpd: 50 },
  { ...common, tier: "fast", id: "vercel", group: "vercel", baseUrl: "https://ai-gateway.vercel.sh/v1", model: "reflection/beam-free", keyEnv: "AI_GATEWAY_API_KEY", extra: { reasoning_effort: "low" } },
  { ...common, tier: "fast", id: "gemini", group: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.1-flash-lite", keyEnv: "GEMINI_API_KEY", reset: "pacific-day" },
];

// Bootstrap is explicitly unmeasured. The evaluator replaces it with results;
// key presence never implies quality, sufficient credit, or policy eligibility.
export const QUALITY_BOOTSTRAP = ["groq-large", "cloudflare-large", "sambanova", "groq-small", "cloudflare-small", "vercel", "openrouter", "gemini"];
export const FAST_BOOTSTRAP = ["groq-small", "cloudflare-small", "vercel", "groq-large", "cloudflare-large", "sambanova", "openrouter", "gemini"];

function configuredProvider(value: unknown): Provider | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Provider;
  if (typeof p.id !== "string" || typeof p.group !== "string" || typeof p.keyEnv !== "string" || typeof p.baseUrl !== "string" || typeof p.reset !== "string") return null;
  if (!/^[a-z0-9-]{1,48}$/.test(p.id) || !/^[a-z0-9-]{1,48}$/.test(p.group) || !/^[A-Z][A-Z0-9_]*$/.test(p.keyEnv) || typeof p.model !== "string" || !p.model.trim()) return null;
  try { if (new URL(p.baseUrl).protocol !== "https:" || new URL(p.baseUrl).username || new URL(p.baseUrl).password) return null; } catch { return null; }
  if (!["headers", "utc-day", "pacific-day"].includes(p.reset)) return null;
  if (p.tier !== undefined && p.tier !== "fast" && p.tier !== "quality") return null;
  if (!Number.isFinite(p.timeoutMs) || p.timeoutMs < 100 || p.timeoutMs > 4000) return null;
  return p;
}

export function providersFromEnv(env: Env): Provider[] {
  let providers = [...FREE_PROVIDERS];
  // Operator-controlled configuration only. No URL or credential from requests.
  if (env.AI_PROVIDERS_JSON) {
    try {
      const parsed: unknown = JSON.parse(env.AI_PROVIDERS_JSON);
      if (!Array.isArray(parsed)) return [];
      providers = parsed.map(configuredProvider).filter((p): p is Provider => p !== null);
    } catch { return []; }
  }
  const seen = new Set<string>();
  return providers.flatMap(p => {
    if (seen.has(p.id) || !env[p.keyEnv]?.trim()) return [];
    if (p.group === "gemini" && env.AI_ENABLE_GEMINI_FREE !== "1") return [];
    if (p.group === "cloudflare" && !/^[a-zA-Z0-9_-]+$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? "")) return [];
    seen.add(p.id);
    const prefix = `AI_${p.id.toUpperCase().replaceAll("-", "_")}`;
    const timeout = Number(env[`${prefix}_TIMEOUT_MS`]);
    const configured = configuredProvider({ ...p, ...(p.group === "openrouter" && env.AI_OPENROUTER_REQUIRE_ZDR === "1" ? { extra: { provider: { data_collection: "deny", zdr: true } } } : {}), model: env[`${prefix}_MODEL`] || p.model, baseUrl: (env[`${prefix}_BASE_URL`] || p.baseUrl).replace("{account_id}", env.CLOUDFLARE_ACCOUNT_ID ?? ""), timeoutMs: timeout >= 100 && timeout <= 4000 ? timeout : p.timeoutMs });
    return configured ? [configured] : [];
  });
}
