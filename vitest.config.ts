import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    env: {
      EPISODE_ID: "episode-001",
    },
  },
});
