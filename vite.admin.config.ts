// The admin dashboard's own build (D100): a second, separate Vite build of
// admin/index.html into dist/admin, run after the game's build. Nothing is
// shared with the game's files, so players never download any admin code
// (tests/admin/bundle.test.ts checks it). The built page gets a strict
// Content Security Policy as a meta tag; netlify.toml adds the headers that
// a meta tag cannot carry. In development the game's Vite server serves
// /admin/ from the same file, without the policy (Vite injects styles).
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

export const ADMIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function adminPolicy(): Plugin {
  return {
    name: "checkervia-admin-csp",
    apply: "build",
    transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${ADMIN_CSP}" />`),
  };
}

export default defineConfig({
  plugins: [react(), adminPolicy()],
  // The game's build already copies public/ (fonts, avatars, favicon).
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    assetsDir: "admin/assets",
    // Every asset its own file: no data URLs to allow in the policy.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rollupOptions: { input: { admin: "admin/index.html" } },
  },
});
