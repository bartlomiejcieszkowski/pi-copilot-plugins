import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    env: {
      PI_TEST_DIR: "/tmp/pi-copilot-plugins-test",
    },
  },
});
