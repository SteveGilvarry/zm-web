import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Backend zm_api address for the dev proxy. Set VITE_API_PROXY_TARGET in a
  // local (gitignored) .env file — see .env.example.
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8080'
  // Public path the built app is served from. Leave as '/' unless the
  // dashboard lives under a sub-path (e.g. VITE_BASE=/zm/). Must end in '/'.
  const base = env.VITE_BASE || '/'
  const proxy = { target: apiTarget, changeOrigin: true, ws: true }

  return {
  base,
  plugins: [
    TanStackRouterVite({
      quoteStyle: 'single',
      // Colocated test files (e.g. src/routes/settings/state.test.tsx) are not
      // route modules — exclude them from the router scan so dev-mode doesn't
      // warn about a missing Route export on every file save.
      routeFileIgnorePattern: '\\.(test|spec)\\.tsx?$',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Split the framework out of the entry chunk. Pages are already lazy
        // (one chunk each, hls.js its own), but everything shared still
        // landed in one 540 kB entry that the login page had to download
        // before it could render a username field. React and the TanStack
        // trio change on their own release cadence, so as separate chunks
        // they stay cached across our deploys instead of being invalidated
        // by every application change.
        // Matched on the resolved path, not the package name: the app
        // imports `react-dom/client`, which the name form does not catch —
        // it left 130 kB of react-dom in the entry chunk. Vite 8 bundles with
        // Rolldown, whose `codeSplitting.groups` replaces `manualChunks`;
        // anything no group matches falls back to automatic splitting.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 20 },
            { name: 'tanstack', test: /node_modules[\\/]@tanstack[\\/]/, priority: 10 },
            { name: 'i18n', test: /node_modules[\\/](i18next|react-i18next)/, priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': proxy,
    },
  },
  // `vite preview` does not inherit `server.proxy`. The seeded e2e suite
  // serves the built app rather than the dev server — same bytes CI ships,
  // and no per-request transform on a two-core runner — so preview needs the
  // same /api route.
  preview: {
    proxy: {
      '/api': proxy,
    },
  },
  }
})
