/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Vitest reuses the Vite plugin chain so TS / JSX / Tailwind / path
// aliases all behave the same as in dev. We deliberately omit the
// TanStackRouterVite plugin here because the generated route tree
// imports route modules eagerly during test discovery and pulls in
// the whole app; unit tests target individual modules.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    css: false,
    // Resetting between tests catches accidental cross-test pollution
    // from module-scoped state (e.g. our auth store's refresh timer).
    clearMocks: true,
    restoreMocks: true,
    // Measure over ALL of src, not just the files a test happened to import.
    // Without `include`, Vitest 4 reported ~76% while 27 source files sat at
    // 0% — the real floor on 2026-08-21 was 54/49/51/55. Thresholds sit a few
    // points under that floor so CI fails on regression, not on noise; ratchet
    // them up as coverage lands (target 85/75/85/85, see
    // docs/PRODUCTION-READINESS-PLAN.md).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/routeTree.gen.ts',
        'src/**/*.d.ts',
        'src/main.tsx',
      ],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      thresholds: {
        // The release bar from docs/PRODUCTION-READINESS-PLAN.md §10. Actuals
        // sit near 96/89/96/97, so these fail on a real regression rather
        // than on noise. Raise them, never lower them.
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
        // Per-file enforcement is NOT done here: `perFile: true` would apply
        // these same numbers to every file, and a glob group is evaluated as
        // an aggregate (its `perFile` is ignored — measured, not assumed).
        // `npm run coverage:floor` does it instead, after the run.
      },
    },
  },
});
