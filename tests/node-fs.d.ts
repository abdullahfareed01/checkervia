// The one Node function the tests use, typed by hand so the project does not
// need @types/node just for this.
declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
}
