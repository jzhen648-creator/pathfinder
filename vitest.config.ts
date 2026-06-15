import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/lib/map/**/*.test.ts",
      "src/lib/ai/generate-reflect.test.ts",
      "src/lib/ai/reflect-sync-plan.test.ts",
      "src/lib/ai/reflect-reading-quality.test.ts",
      "src/lib/pursuit/normalize-pursuit-enrich.test.ts",
      "src/lib/insights/clamp-insight-json.test.ts",
      "src/lib/story/validate-reading-output.test.ts",
      "src/lib/timeline/spine-events.test.ts",
    ],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
