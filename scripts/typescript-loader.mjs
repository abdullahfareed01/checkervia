// Uses the existing TypeScript installation; no dependency or .env loading.
import { existsSync } from 'node:fs';
import { transform } from 'rolldown/utils';
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (error) {
    if (specifier.startsWith('.') && context.parentURL) {
      for (const suffix of ['.ts', '/index.ts']) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(url)) return { url: url.href, shortCircuit: true };
      }
    }
    throw error;
  }
}
export async function load(url, context, next) {
  if (!url.endsWith('.ts')) return next(url, context);
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL(url), 'utf8');
  const result = await transform(new URL(url).pathname, source, { lang: 'ts', target: 'es2022' });
  if (result.errors.length) throw new Error('Evaluation TypeScript transform failed. Run npm run typecheck.');
  return { format: 'module', shortCircuit: true, source: result.code };
}
