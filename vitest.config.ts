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
  },
});
