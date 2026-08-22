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
      '@': path.resolve(__dirname, './src'),
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
