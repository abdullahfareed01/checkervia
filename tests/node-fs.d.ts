// The Node functions the tests use, typed by hand so the project does not
// need @types/node just for these.
declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
  export function readdirSync(path: URL | string, options: { recursive: true }): string[];
}
