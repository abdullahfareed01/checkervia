import { register } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
register('./typescript-loader.mjs', import.meta.url);

// Only process environment is used. This program never reads an .env file,
// calls dotenv, runs Vite, or prints upstream exceptions/credential values.
const { generatePositions, buildCases, evaluateProvider, evaluationReport, aggregateMeasurement, capacityReport } = await import('./eval-ai-models.ts');
const { FREE_PROVIDERS, providersFromEnv } = await import('../netlify/ai/providers.ts');
const date = new Date().toISOString();
const cases = buildCases(generatePositions());
const fixtureHash = createHash('sha256').update(JSON.stringify(cases.map(c => [c.id, c.prompt]))).digest('hex');
const resultPath = new URL('../docs/03-technical/ai-eval-results.json', import.meta.url);
const rankingPath = new URL('../netlify/ai/model-ranking.json', import.meta.url);
const reportPath = new URL('../docs/03-technical/ai-model-ranking.md', import.meta.url);
let previous = { version: 1, results: [] };
if (existsSync(resultPath)) {
  try { previous = JSON.parse(readFileSync(resultPath, 'utf8')); } catch { /* Start safely without printing file contents. */ }
}
const results = previous.version === 2 && previous.fixtureHash === fixtureHash && Array.isArray(previous.results) ? previous.results : [];
const archivedQuota = [...(previous.archivedQuota ?? []), ...(results === previous.results ? [] : previous.results ?? [])].map(r => ({ ...r, samples: r.samples.filter(s => (s.startedAt ?? Date.now()) > Date.now() - 86400000) })).filter(r => r.samples.length);
const providers = providersFromEnv(process.env);
console.log(JSON.stringify({ positions: cases.filter(c => c.context.job === 'move').length / 4, moveCases: cases.filter(c => c.context.job === 'move').length, tauntCases: cases.filter(c => c.context.job === 'taunt').length, configuredModels: providers.map(p => p.id) }));
const save = () => {
  writeFileSync(resultPath, JSON.stringify({ version: 2, fixtureHash, checkedAt: date, archivedQuota, results }, null, 2) + '\n');
  const measurements = results.map(aggregateMeasurement);
  writeFileSync(rankingPath, JSON.stringify({ checkedAt: date, measurements }, null, 2) + '\n');
  writeFileSync(reportPath, evaluationReport(date, FREE_PROVIDERS, results, cases) + capacityReport(FREE_PROVIDERS, results, cases));
};
save();
for (const provider of process.argv.includes('--report-only') ? [] : providers) {
  const prior = results.find(r => r.id === provider.id && r.model === provider.model);
  const result = await evaluateProvider(provider, process.env, cases, {
    prior,
    quotaHistory: archivedQuota.filter(r => r.id === provider.id && r.model === provider.model).flatMap(r => r.samples),
    checkpoint: next => {
      const index = results.findIndex(r => r.id === next.id);
      if (index >= 0) results[index] = next; else results.push(next);
      save();
    },
    log: entry => console.log(JSON.stringify(entry)),
  });
  const index = results.findIndex(r => r.id === result.id);
  if (index >= 0) results[index] = result; else results.push(result);
  save();
}
console.log(JSON.stringify({ report: 'docs/03-technical/ai-model-ranking.md', completeModels: results.filter(r => r.complete).length }));
