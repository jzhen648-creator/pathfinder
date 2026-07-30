import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts", "src/app/api/**/*.test.ts"],
    // Legacy node:test scripts (assert + console.log) — not vitest suites.
    exclude: [
      "src/lib/goal-short-label.test.ts",
      "src/lib/canvas-label-salience.test.ts",
      "src/lib/icons/match-pursuit-icon-override.test.ts",
      "src/lib/pursuit/pursuit-finance.test.ts",
      "src/lib/pursuit/pursuit-title.test.ts",
    ],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
