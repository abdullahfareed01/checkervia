// The Node functions the tests use, typed by hand so the project does not
// need @types/node just for these.
declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
  export function readdirSync(path: URL | string, options?: { recursive: true }): string[];
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options: { recursive: true; force: true }): void;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}

declare const process: { env: Record<string, string | undefined>; cwd(): string };
