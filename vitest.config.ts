import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    env: {
      EPISODE_ID: "episode-001",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.generated.*", "src/index.ts", "src/Root.tsx", "src/compositions/**"],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 65,
        lines: 60,
      },
    },
  },
});
