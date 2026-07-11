import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/integration/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
    fileParallelism: false,
    // Pin TZ so date-comparison tests (e.g. isWorkingDay) pass deterministically
    // regardless of the developer's host timezone.
    env: { TZ: "UTC" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  // tsconfig sets `jsx: "preserve"` for Next.js, which Vitest 4's oxc
  // transformer can't emit as-is. Override oxc's JSX handling to use the
  // automatic runtime so Vitest can compile `.tsx` components — e.g. the
  // billing success-view rendering tests. (esbuild options are ignored when
  // oxc is active.)
  oxc: {
    jsx: { runtime: "automatic" },
  },
});
