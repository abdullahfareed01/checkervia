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

export default defineConfig({
  plugins: [react(), adminPages()],
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
