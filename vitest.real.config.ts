import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/real.test.ts"], fileParallelism: false, testTimeout: 240000 },
});
