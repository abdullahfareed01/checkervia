import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
