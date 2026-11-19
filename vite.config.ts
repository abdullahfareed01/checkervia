import { defineConfig } from "vitest/config";
import type { Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// Development only: /admin and every page under it open admin/index.html,
// as Netlify's rewrite does in production (netlify.toml, D100). The game's
// build is not touched: the admin page has its own build
// (vite.admin.config.ts).
function adminPages(): Plugin {
  return {
    name: "checkervia-admin-pages",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        // Typed by hand: the project has no @types/node.
        const incoming = request as unknown as { url?: string };
        const [path, query] = (incoming.url ?? "").split("?");
        if (path && /^\/admin(\/[a-z]*)?\/?$/.test(path)) incoming.url = `/admin/index.html${query ? `?${query}` : ""}`;
        next();
      });
    },
  };
}

// Development only (D145): `npm run dev:online` serves every function from
// netlify/ on in memory stores inside this Vite server, so two browser
// windows (one normal, one private) can play an online room without
// Supabase or netlify dev. Nothing here is in a build: the plugin only runs
// with the dev server in mode "online". The AI is not served in this mode.
// The parts of Node's request this uses (the project has no Node types).
interface NodeRequest extends AsyncIterable<unknown> {
  readonly url?: string;
  readonly method?: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly socket: { readonly remoteAddress?: string };
}

function devFunctions(): Plugin {
  return {
    name: "checkervia-dev-functions",
    apply: "serve",
    configureServer(server) {
      if (server.config.mode !== "online") return;
      let backend: Promise<{ call: (name: string, request: unknown) => Promise<{ status: number; body: unknown } | null> }> | null = null;
      server.middlewares.use(async (incoming, res, next) => {
        const req = incoming as unknown as NodeRequest;
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/.netlify/functions/")) return next();
        backend ??= server.ssrLoadModule("/netlify/online/devBackend.ts").then((module) => module.createDevBackend());
        let body = "";
        for await (const chunk of req) body += String(chunk);
        const header = (name: string) => {
          const value = req.headers[name];
          return typeof value === "string" ? value : null;
        };
        const result = await (await backend).call(url.pathname.split("/").pop() ?? "", {
          method: req.method ?? "GET",
          body: req.method === "POST" ? body : "",
          query: url.searchParams,
          authorization: header("authorization"),
          deviceId: header("x-checkervia-device"),
          ip: req.socket.remoteAddress ?? "127.0.0.1",
        });
        res.statusCode = result?.status ?? 404;
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        res.end(JSON.stringify(result?.body ?? { error: "Not served in this mode.", code: "notFound" }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), adminPages(), devFunctions()],
  server: {
    // netlify dev forwards pages to exactly this port (netlify.toml,
    // targetPort). If it is taken, stop with an error instead of quietly
    // moving to 5174, which leaves netlify dev showing "Could not proxy
    // request" (DEV-008).
    port: 5173,
    strictPort: true,
  },
  test: {
    // Engine tests are pure TypeScript, so no browser environment is needed.
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
