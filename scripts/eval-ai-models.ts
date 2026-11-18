import { applyMove, drawReason, getLegalMoves, initialBoard, opponentOf } from "../src/engine";
import type { Board, GamePosition, Player } from "../src/engine";
import { analyzeMoves } from "../src/ai/search";
import { pickCandidates } from "../src/ai/candidates";
import { AI_LEVELS, LEVELS } from "../src/ai/difficulty";
import { parseReply } from "../src/ai/parseReply";
import { promptForContext, TAUNT_EVENTS } from "../src/ai/request";
import type { ModelContext } from "../src/ai/request";
import { checkedReasons, reasonPasses } from "../src/ai/truth";
import { callProvider, OUTPUT_TOKEN_CAP, validTaunt } from "../netlify/ai/adapter";
import type { TokenUsage } from "../netlify/ai/adapter";
import { cooldownUntil, nextPacificMidnight, nextUtcMidnight } from "../netlify/ai/cooldowns";
import type { Env, Provider } from "../netlify/ai/providers";
import { moveScore, providerOrder, tauntScore } from "../netlify/ai/ranking";
import type { ModelMeasurement } from "../netlify/ai/ranking";

export const CATEGORIES = ["opening", "midgame", "capture", "multi-jump", "king", "endgame"] as const;
export interface EvalPosition { board: Board; player: Player; category: typeof CATEGORIES[number]; replay: readonly number[] }
export interface EvalCase { id: string; context: ModelContext; scores: readonly number[]; prompt: string }

export function generatePositions(): EvalPosition[] {
  const positions: EvalPosition[] = [];
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  let seed = 0x5eed123;
  const randomIndex = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let game = 0; game < 300 && positions.length < 42; game++) {
    let board = initialBoard(), player: Player = "black";
    const history: GamePosition[] = [{ board, player: null, move: null }];
    const replay: number[] = [];
    for (let ply = 0; ply < 220; ply++) {
      const legal = getLegalMoves(board, player);
      if (!legal.length) break;
      const pieces = board.flat().filter(p => p !== null);
      const categories = CATEGORIES.filter(c => c === "opening" ? ply < 8 : c === "midgame" ? ply >= 12 && pieces.length > 8 : c === "capture" ? legal.some(m => m.captured.length > 0) : c === "multi-jump" ? legal.some(m => m.captured.length > 1) : c === "king" ? pieces.some(p => p.kind === "king") : pieces.length <= 6);
      const key = JSON.stringify([board, player]);
      // Prefer the rare cases before general midgame positions.
      const category = [...categories].reverse().find(c => (counts.get(c) ?? 0) < 7);
      if (category && !seen.has(key)) {
        positions.push({ board, player, category, replay: [...replay] });
        counts.set(category, (counts.get(category) ?? 0) + 1);
        seen.add(key);
      }
      const index = randomIndex(legal.length);
      const move = legal[index]!;
      board = applyMove(board, move);
      player = opponentOf(player);
      replay.push(index);
      history.push({ board, player: opponentOf(player), move });
      if (drawReason(history)) break;
    }
  }
  if (positions.length !== 42) throw new Error("Evaluation fixture coverage failed.");
  return positions;
}

export function buildCases(positions: readonly EvalPosition[]): EvalCase[] {
  const cases: EvalCase[] = [];
  for (const [i, position] of positions.entries()) for (const level of LEVELS) {
    const { depth, candidates } = AI_LEVELS[level];
    const scores = analyzeMoves(position.board, position.player, depth).map(a => a.score);
    const indexes = pickCandidates(scores, candidates);
    const context: ModelContext = { job: "move", board: position.board, player: position.player, level, opening: position.category === "opening", candidates: indexes, scores: indexes.map(index => scores[index]!) };
    // Easy's fixed 30% slip sample is deterministic and uses the real no-score prompt.
    if (level === 1 && i % 10 < 3) delete context.scores;
    cases.push({ id: `v1-${i}-${position.category}-level-${level}`, context, scores, prompt: promptForContext(context) });
  }
  for (const [i, position] of positions.entries()) {
    const context: ModelContext = { job: "taunt", board: position.board, player: position.player, level: LEVELS[i % 4]!, opening: false, candidates: [], event: TAUNT_EVENTS[i % TAUNT_EVENTS.length]!, verdict: null };
    cases.push({ id: `v1-taunt-${i}`, context, scores: [], prompt: promptForContext(context) });
  }
  return cases;
}

export interface EvalSample {
  startedAt: number;
  caseId: string; job: "move" | "taunt"; valid: boolean; top: boolean; best: boolean; truth: boolean; taunt: boolean;
  elapsedMs: number; promptBytes: number; replyBytes: number; usage: TokenUsage | null; code?: string;
}
export interface EvalResult { id: string; model: string; complete: boolean; samples: EvalSample[]; stoppedCode?: string; retryAt?: number }
// Interleave categories, levels and taunts so even a small daily allowance
// samples the whole task rather than only openings. IDs stay stable on resume.
export function scheduleCases(cases: readonly EvalCase[]): EvalCase[] {
  const buckets = new Map<string, number[]>();
  for (const c of cases) {
    const match = /^v1-(\d+)-(.+)-level-\d$/.exec(c.id);
    if (!match) continue;
    const bucket = buckets.get(match[2]!) ?? [];
    if (!bucket.includes(Number(match[1]))) bucket.push(Number(match[1]));
    buckets.set(match[2]!, bucket);
  }
  const positionOrder = new Map<number, number>();
  for (const [category, ids] of buckets) for (const [index, id] of ids.entries()) positionOrder.set(id, index * CATEGORIES.length + Math.max(0, CATEGORIES.indexOf(category as typeof CATEGORIES[number])));
  const order = (c: EvalCase) => {
    const id = Number(c.id.match(/^v1-(?:taunt-)?(\d+)/)?.[1]);
    return (positionOrder.get(id) ?? id) * 5 + (c.context.job === "taunt" ? 4 : c.context.level - 1);
  };
  return [...cases].sort((a, b) => order(a) - order(b));
}
interface EvalDeps {
  fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>;
  prior?: EvalResult; checkpoint?: (result: EvalResult) => void;
  quotaHistory?: readonly EvalSample[];
  log?: (entry: { provider: string; code: string; count: number }) => void;
}
const bytes = (s: string) => new TextEncoder().encode(s).length;
function evaluationInterval(p: Provider, sample: EvalSample): number {
  const reserved = Math.max(sample.usage?.total ?? 0, Math.ceil(sample.promptBytes / 3) + OUTPUT_TOKEN_CAP);
  return Math.max(60000 / (p.rpm ?? 10), p.tpm ? 60000 * reserved / p.tpm : 0) * 1.1;
}
const pacificQuotaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
function quotaDay(p: Provider, time: number): string {
  return p.reset === "pacific-day" ? pacificQuotaDay.format(time) : new Date(time).toISOString().slice(0, 10);
}
function dailyQuotaReset(p: Provider, time: number): number {
  return p.reset === "pacific-day" ? nextPacificMidnight(time) : nextUtcMidnight(time);
}
export async function evaluateProvider(p: Provider, env: Env, cases: readonly EvalCase[], deps: EvalDeps = {}): Promise<EvalResult> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const result: EvalResult = { id: p.id, model: p.model, complete: false, samples: deps.prior?.model === p.model ? [...deps.prior.samples] : [] };
  let retryAt = deps.prior?.retryAt;
  if (retryAt && deps.prior?.stoppedCode === "DAILY_SAFETY_STOP" && p.reset !== "headers" && result.samples.length) {
    // Older checkpoints used rolling days for every provider. Known calendar
    // resets may shorten our own safety stop, never provider-supplied advice.
    const latest = Math.max(...result.samples.map(s => s.startedAt ?? now()));
    retryAt = Math.min(retryAt, dailyQuotaReset(p, latest));
  }
  if (retryAt && retryAt > now()) return { ...result, stoppedCode: deps.prior?.stoppedCode, retryAt };
  if (!env[p.keyEnv]) return { ...result, stoppedCode: "MISSING_KEY" };
  const completed = new Set(result.samples.map(s => s.caseId));
  // Restarting the command must not reset the account's minute allowance.
  let nextAt = Math.max(0, ...[...(deps.quotaHistory ?? []), ...result.samples].map(sample => (sample.startedAt ?? now()) + evaluationInterval(p, sample)));
  let transportFailures = 0;
  for (const c of scheduleCases(cases)) {
    if (completed.has(c.id)) continue;
    // A resumed checkpoint is not a new daily allowance. Count a rolling
    // 24 hours conservatively when the provider has no documented boundary.
    const recent = [...(deps.quotaHistory ?? []), ...result.samples].filter(s => p.reset === "headers" ? (s.startedAt ?? now()) > now() - 86400000 : quotaDay(p, s.startedAt ?? now()) === quotaDay(p, now()));
    const usedTokens = recent.reduce((sum, s) => sum + (s.usage?.total ?? Math.ceil(s.promptBytes / 3) + OUTPUT_TOKEN_CAP), 0);
    if ((p.rpd && recent.length >= p.rpd) || (p.tpd && usedTokens + Math.ceil(bytes(c.prompt) / 3) + OUTPUT_TOKEN_CAP > p.tpd)) {
      result.stoppedCode = "DAILY_SAFETY_STOP";
      result.retryAt = p.reset === "headers" ? Math.max(now(), ...recent.map(s => s.startedAt ?? now())) + 86400000 : dailyQuotaReset(p, now());
      deps.checkpoint?.(result);
      return result;
    }
    const delay = Math.max(0, nextAt - now());
    if (delay) await sleep(delay);
    const started = now();
    const answer = await callProvider(p, env, c.prompt, c.context.job, c.context.candidates.length, deps.fetch ?? fetch, 15000, now, c.context);
    if (!answer.ok && [402, 429].includes(answer.status ?? 0)) {
      result.stoppedCode = answer.code;
      result.retryAt = cooldownUntil(p, answer.headers, answer.body, now());
      deps.log?.({ provider: p.id, code: answer.code, count: result.samples.length });
      deps.checkpoint?.(result);
      return result;
    }
    const sample: EvalSample = { startedAt: started, caseId: c.id, job: c.context.job, valid: answer.ok, top: false, best: false, truth: false, taunt: false, elapsedMs: answer.elapsedMs, promptBytes: bytes(c.prompt), replyBytes: answer.ok ? bytes(answer.text) : answer.replyBytes ?? 0, usage: answer.usage ?? null, ...(!answer.ok ? { code: answer.code } : {}) };
    if (answer.ok && c.context.job === "move") {
      const parsed = parseReply(answer.text, c.context.candidates.length);
      if (parsed.ok) {
        const index = c.context.candidates[parsed.number - 1]!;
        const legal = getLegalMoves(c.context.board, c.context.player);
        const best = Math.max(...c.scores);
        sample.top = pickCandidates(c.scores, AI_LEVELS[c.context.level].candidates).includes(index);
        sample.best = c.scores[index] === best;
        sample.truth = reasonPasses(parsed.reason, checkedReasons(c.context.board, legal[index]!, c.context.player, legal.length, c.context.scores?.[parsed.number - 1], c.context.scores ? Math.max(...c.context.scores) : undefined));
      }
    }
    if (answer.ok && c.context.job === "taunt") sample.taunt = validTaunt(answer.text, c.context);
    result.samples.push(sample);
    deps.log?.({ provider: p.id, code: answer.ok ? "OK" : answer.code, count: result.samples.length });
    deps.checkpoint?.(result);
    if (!answer.ok && [400, 401, 403, 404, 422].includes(answer.status ?? 0)) {
      result.stoppedCode = answer.code;
      deps.checkpoint?.(result);
      return result;
    }
    transportFailures = !answer.ok && ["TIMEOUT", "NETWORK"].includes(answer.code) ? transportFailures + 1 : 0;
    if (transportFailures >= 3) {
      result.stoppedCode = "TRANSPORT_UNAVAILABLE";
      result.retryAt = now() + 5 * 60000;
      deps.checkpoint?.(result);
      return result;
    }
    nextAt = started + evaluationInterval(p, sample);
  }
  result.complete = cases.every(c => result.samples.some(s => s.caseId === c.id));
  deps.checkpoint?.(result);
  return result;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n ? n % 2 ? sorted[Math.floor(n / 2)]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2 : 0;
}
const code = (s: string) => `\`${s}\``;
export function aggregateMeasurement(r: EvalResult): ModelMeasurement {
  const moves = r.samples.filter(s => s.job === "move"), taunts = r.samples.filter(s => s.job === "taunt");
  const rate = (samples: readonly EvalSample[], key: "valid" | "top" | "best" | "truth" | "taunt") => samples.length ? samples.filter(s => s[key]).length / samples.length : 0;
  const tokens = r.samples.flatMap(s => s.usage ? [s.usage.total] : []);
  return { id: r.id, model: r.model, complete: r.complete, samples: r.samples.length, validRate: rate(moves, "valid"), topRate: rate(moves, "top"), bestRate: rate(moves, "best"), truthRate: rate(moves, "truth"), tauntRate: rate(taunts, "taunt"), medianMs: median(r.samples.map(s => s.elapsedMs)), moveMedianMs: median(moves.map(s => s.elapsedMs)), tauntMedianMs: median(taunts.map(s => s.elapsedMs)), slowestMs: Math.max(0, ...r.samples.map(s => s.elapsedMs)), averageTokens: tokens.length ? tokens.reduce((a, b) => a + b, 0) / tokens.length : null };
}

export function evaluationReport(date: string, providers: readonly Provider[], results: readonly EvalResult[], cases: readonly EvalCase[]): string {
  const measurements = results.map(aggregateMeasurement);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const rowsFor = (job: "move" | "taunt") => providerOrder(providers, { job, level: 4, opening: true }, {}, measurements).map(p => {
    const r = results.find(r => r.id === p.id && r.model === p.model);
    const samples = r?.samples.filter(s => s.job === job) ?? [];
    const empty = job === "move" ? "n/a | n/a | n/a | n/a | n/a | n/a | n/a" : "n/a | n/a | n/a | n/a";
    const status = r ? r.complete ? "complete" : `incomplete (${r.stoppedCode ?? "partial"})` : "unmeasured";
    if (!r || !samples.length) return `| ${code(p.id)}: ${code(p.model)} | ${status} | 0 | ${empty} |`;
    const m = aggregateMeasurement({ ...r, samples });
    const prefix = `| ${code(p.id)}: ${code(p.model)} | ${status} | ${samples.length} |`;
    const timings = `${m.medianMs.toFixed(0)} / ${m.slowestMs.toFixed(0)}`;
    const usage = `${m.averageTokens?.toFixed(1) ?? "unknown"} (${samples.filter(s => s.usage).length}/${samples.length})`;
    const score = r.complete ? (job === "move" ? moveScore(m) : tauntScore(m)).toFixed(1) : "unranked";
    return job === "move" ? `${prefix} ${pct(m.validRate)} | ${pct(m.topRate)} | ${pct(m.bestRate)} | ${pct(m.truthRate)} | ${timings} | ${usage} | ${score} |` : `${prefix} ${pct(m.tauntRate)} | ${timings} | ${usage} | ${score} |`;
  }).join("\n");
  const order = (job: "move" | "taunt", level: 1 | 2 | 3 | 4, opening: boolean) => providerOrder(providers, { job, level, opening }, {}, measurements).map(p => code(p.id)).join(" → ");
  return `# AI model evaluation

Checked ${code(date)}. Run ${code("npm run eval:ai")}; it uses process environment only and never opens .env. Repeating the command resumes checkpoints. Prompt changes invalidate quality samples by hash while preserving recent quota history. Use ${code("npm run eval:ai -- --report-only")} to refresh this report without API calls.

${cases.filter(c => c.context.job === "move").length / 4} unique positions replayed by the engine, seven each of openings, midgame, forced captures, multi jumps, kings and endgames, at all four levels (${cases.filter(c => c.context.job === "move").length} move cases), plus ${cases.filter(c => c.context.job === "taunt").length} event/level taunt cases. Seed 0x5eed123. Easy includes a deterministic slip sample.

## Moves

| Model | Status | Move samples | First valid | In level candidates | Best engine score | Reason checked | Median / max ms | Mean total tokens (usage coverage) | Score |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rowsFor("move")}

## Taunts

| Model | Status | Taunt samples | Clean valid | Median / max ms | Mean total tokens (usage coverage) | Score |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${rowsFor("taunt")}

Only complete runs with at least 40 samples affect automatic order. Incomplete rows stay unranked. Rates use all attempts as the denominator, so transport failures reduce the operational score; they do not establish reasoning quality, and missing usage does not establish token cost. Candidate membership is constrained by the offered list (all legal moves on Easy); best score accuracy distinguishes stronger picks. Truth passes only exact statements proved by the engine; other prose is unverified. Tokens include rejected replies when usage is returned. Completion tokens already include reasoning, which is recorded separately without double counting. Usage coverage below 100% cannot establish actual whole chain token consumption. OpenRouter's free router is a changing pool, not a pinned model.

Move score = 30% validity + 20% candidate membership + 30% best score + 20% reason truth. Taunt score = 75% clean valid taunts + 25% speed (linear to zero at 4s). Median latency for the current job at/above the configured attempt deadline demotes a model before scoring. Fast jobs try the configured lightweight tier before quality models and use measured taunt scores within each tier. This reserves the best models for Hard/Strongest and openings, even if a heavy model has a better taunt score. Evaluation allows 15s to identify slow models. No partial run is promoted.

## Current order

${measurements.some(m => m.complete) ? "Complete measurements are applied below." : "No complete live measurements exist. These are explicit provisional bootstrap orders, not measured rankings."}

- Hard/Strongest and opening moves: ${order("move", 4, false)} → engine.
- Easy/Medium subsequent moves: ${order("move", 2, false)} → engine.
- All standalone taunts: ${order("taunt", 4, true)} → local line.

Only keyed, eligible providers participate at runtime. Gemini needs its policy flag. Manual lists of IDs separated by commas win: AI_PROVIDER_ORDER, AI_MOVE_PROVIDER_ORDER, AI_FAST_PROVIDER_ORDER, AI_TAUNT_PROVIDER_ORDER. A nonempty override for the job takes precedence over the global override.

The runner spaces calls using RPM/TPM with a safety margin, stops on 402/429, honors retry/reset advice and checkpoints counts without response text. Permanent HTTP/configuration errors and three consecutive transport failures also stop a run. It proactively stops before known daily request/token caps using the documented UTC/Pacific day, or conservative rolling accounting over 24 hours when the reset boundary is unknown. Restarts retain minute spacing and resume later without repeating completed cases. Shared account traffic can exhaust quota sooner. Missing keys are skipped. No paid models are selected by default.
`;
}

export function capacityReport(providers: readonly Provider[], results: readonly EvalResult[], cases: readonly EvalCase[]): string {
  const meanPrompt = cases.filter(c => c.context.job === "move").reduce((sum, c) => sum + bytes(c.prompt), 0) / cases.filter(c => c.context.job === "move").length;
  // This is an explicitly labelled planning estimate, not provider tokenization.
  const estimatedInput = Math.ceil(meanPrompt / 3);
  const estimatedOutput = OUTPUT_TOKEN_CAP;
  const groups = new Set<string>();
  let estimateTotal = 0;
  let chatTotal = 0;
  const measuredGroups = new Set<string>();
  let measuredMoves = 0;
  let measuredChats = 0;
  const measuredCapacity = new Map<string, number>();
  const tauntCases = cases.filter(c => c.context.job === "taunt");
  const tauntInput = tauntCases.length ? Math.ceil(tauntCases.reduce((sum, c) => sum + bytes(c.prompt), 0) / tauntCases.length / 3) : 200;
  const rows: string[] = [];
  for (const p of providers) {
    const result = results.find(r => r.id === p.id && r.model === p.model);
    const samples = result?.samples.filter(s => s.job === "move" && s.usage) ?? [];
    const mean = (key: "input" | "output" | "total") => samples.reduce((sum, s) => sum + s.usage![key], 0) / samples.length;
    const input = samples.length ? mean("input") : estimatedInput;
    const output = samples.length ? mean("output") : estimatedOutput;
    const total = samples.length ? mean("total") : input + output;
    let calls = Math.min(p.rpd ?? Infinity, p.tpd ? Math.floor(p.tpd / total) : Infinity);
    if (p.inputNeurons && p.outputNeurons) calls = Math.min(calls, Math.floor(10000 / ((input * p.inputNeurons + output * p.outputNeurons) / 1e6)));
    const games = Number.isFinite(calls) ? Math.floor(calls / 30) : null;
    const raw = results.find(r => r.id === p.id && r.model === p.model)?.samples.filter(s => s.job === "move") ?? [];
    const taunts = result?.samples.filter(s => s.job === "taunt") ?? [];
    const measured = result?.complete && raw.length > 0 && samples.length === raw.length && taunts.length > 0 && taunts.every(s => s.usage !== null);
    if (measured && games !== null) measuredCapacity.set(p.id, games);
    if (measured && games !== null && !measuredGroups.has(p.group)) {
      const tauntMean = (key: "input" | "output" | "total") => taunts.reduce((sum, s) => sum + s.usage![key], 0) / taunts.length;
      let chats = Math.min(p.rpd ? Math.floor(p.rpd / 62) : Infinity, p.tpd ? Math.floor(p.tpd / (30 * total + 32 * tauntMean("total"))) : Infinity);
      if (p.inputNeurons && p.outputNeurons) chats = Math.min(chats, Math.floor(10000 / (((30 * input + 32 * tauntMean("input")) * p.inputNeurons + (30 * output + 32 * tauntMean("output")) * p.outputNeurons) / 1e6)));
      measuredMoves += games;
      if (Number.isFinite(chats)) measuredChats += chats;
      measuredGroups.add(p.group);
    }
    const replyBytes = raw.length ? (raw.reduce((sum, s) => sum + s.replyBytes, 0) / raw.length).toFixed(0) : "unmeasured";
    rows.push(`| ${code(p.id)} | ${samples.length ? `returned usage (${samples.length}/${raw.length} calls)` : "planning estimate only"} | ${input.toFixed(0)} | ${output.toFixed(0)} | ${replyBytes} | ${games ?? "unknown account/promotion cap"} |`);
    if (!groups.has(p.group) && p.group !== "gemini" && games !== null) {
      estimateTotal += games;
      const tauntUsage = taunts.flatMap(s => s.usage ? [s.usage] : []);
      const tauntMean = (key: "input" | "output" | "total", fallback: number) => tauntUsage.length ? tauntUsage.reduce((sum, usage) => sum + usage[key], 0) / tauntUsage.length : fallback;
      const chatInput = tauntMean("input", tauntInput);
      const chatOutput = tauntMean("output", estimatedOutput);
      const gameTokens = 30 * total + 32 * tauntMean("total", chatInput + chatOutput);
      let chats = Math.min(p.rpd ? Math.floor(p.rpd / 62) : Infinity, p.tpd ? Math.floor(p.tpd / gameTokens) : Infinity);
      if (p.inputNeurons && p.outputNeurons) chats = Math.min(chats, Math.floor(10000 / (((30 * input + 32 * chatInput) * p.inputNeurons + (30 * output + 32 * chatOutput) * p.outputNeurons) / 1e6)));
      if (Number.isFinite(chats)) chatTotal += chats;
      groups.add(p.group);
    }
  }
  const qualityGroups = new Set<string>();
  let qualityMoves = 0;
  for (const p of providerOrder(providers, { job: "move", level: 4, opening: true }, {}, results.map(aggregateMeasurement))) {
    if (qualityGroups.has(p.group) || !measuredCapacity.has(p.id)) continue;
    qualityGroups.add(p.group);
    qualityMoves += measuredCapacity.get(p.id)!;
  }
  return `
## Capacity at 30 AI turns per game

Real generated move prompts average **${meanPrompt.toFixed(0)} bytes** in ${code("UTF-8")}. Without provider usage, input is estimated as ceil(bytes/3) = **${estimatedInput} tokens**, plus the full completion budget of **${estimatedOutput} tokens** including thinking. This is a planning scenario, not a tokenizer measurement or a bound for every tokenizer. Reply byte counts include rejected responses when captured; earlier missing response metadata remains unknown.

| Model | Evidence | Input tokens/call | Output including thinking/call | Mean reply bytes | Games/day with moves only |
| --- | --- | ---: | ---: | ---: | ---: |
${rows.join("\n")}

Known numeric pools combined: **${estimateTotal} games/day with model assistance in this planning scenario** for 30 move calls and local lines; **${chatTotal}/day** for 30 moves plus 32 standalone taunts (one per move, start and end). Use returned move and taunt usage when available, reserving the full output cap only for unmeasured replies; incomplete usage coverage remains an estimate. Count Groq and Cloudflare only once each, take the pool for each smaller model, and exclude conditional Gemini and unknown Vercel caps. Routing to larger models costs more; failures, other traffic and extra idle taunts also reduce capacity. Rounding separately for each provider leaves unused calls, which can combine across a game.

${measuredGroups.size ? `Complete benchmarks with full move and taunt usage coverage establish **${measuredMoves} move only games/day**, or **${measuredChats} games/day with 32 standalone taunts**, as token based capacity scenarios for the tested numeric pools: ${[...measuredGroups].map(code).join(", ")}. Each shared pool is counted once using its first eligible model above. Selecting the highest ranked complete model per shared pool for quality moves instead gives **${qualityMoves} move only games/day**. These scenarios use fresh daily allowances and average measured usage, include thinking and rejected responses, assume no other account traffic, and describe attempt capacity rather than guaranteed valid answers. They are not today's remaining allowance after this evaluation. Mixed difficulty, quality openings, failover and extra idle chatter change the consumption. Unknown account caps and inaccessible providers add no measured capacity.` : "Measured games/day for the whole chain remains **unknown until eligible keyed models produce usage samples** across the benchmark with adequate usage coverage."}

The exact whole chain daily total remains unknown when a configured provider has no numeric account cap. These are capacity scenarios, not guarantees of successful responses. Providers attempted in this checkpoint: ${results.map(r => code(r.id)).join(", ") || "none"}. Providers without keys contribute no measured quota. Games using only the engine have no provider quota.
`;
}
