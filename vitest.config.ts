import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    env: {
      PI_TEST_DIR: "/tmp/pi-copilot-plugins-test",
    },
  },
});
