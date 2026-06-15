# Contributing to zm-dashboard

Thanks for your interest in improving zm-dashboard! This guide covers how to get a change
merged.

## 📜 Contributor License Agreement

zm-dashboard is **dual-licensed** — open source under [AGPL-3.0](LICENSE), and available
under a separate commercial license. For the project to be offered under both, every
contribution must be covered by the [Contributor License Agreement](CLA.md).

**By opening a pull request you agree to the [CLA](CLA.md)** for that and all future
contributions. You keep the copyright in your work — the CLA is a license grant, not an
assignment, that lets the maintainer license the project under both AGPL and commercial
terms. Please read it before contributing.

> **Maintainer note:** to enforce this automatically, add a
> [CLA Assistant](https://github.com/contributor-assistant/github-action) workflow under
> `.github/workflows/` and make its `CLA Assistant` status check **required** in
> **Settings → Branches → branch protection rule for `main`**. Until that is wired up, the
> CLA is accepted by opening a PR (per the paragraph above).

## 🛠️ Development workflow

Get set up with the [Quick Start](README.md#-quick-start) (Node 20+, `npm install`, and a
`.env` pointing `VITE_API_PROXY_TARGET` at a running [`zm_api`](https://github.com/SteveGilvarry/zm-api)
backend).

Before opening a PR:

1. **Add or update a test** that captures the behaviour change — colocated `*.test.ts(x)`
   for unit logic (Vitest + Testing Library), or `*.spec.ts` for end-to-end flows
   (Playwright).
2. **Implement** the smallest change that makes it pass.
3. **Run the quality gates** — all must be green:

   ```bash
   npm run lint           # ESLint
   npm test               # Vitest unit suite
   npm run build          # tsc -b type-check + production build
   ```

4. If you touched a user-facing flow, run the end-to-end suite too (needs the dev server
   and a reachable backend):

   ```bash
   npm run test:e2e       # Playwright (:chromium / :webkit for a single browser)
   ```

## 🧭 Conventions

- **Dual-skin first.** Every feature must work in both the **Mission Control** and
  **Classic** skins. Put shared data/logic in `src/features/<feature>/` (skin-agnostic
  hooks); route bodies dispatch on `useUiStore.skin` and render either the modern panel
  layout or the classic table. See [`CLAUDE.md`](CLAUDE.md) for the architecture.
- **Data fetching** goes through TanStack Query — no raw `fetch` in components. Add typed
  API wrappers in `src/api/<feature>.ts`.
- **Styling** is Tailwind classes only — no CSS modules or styled-components.
- Use the `@/` path alias for imports from `src/`. Components are `PascalCase`; routes are
  kebab-case or `$param` files.
- Keep changes small and focused; don't reformat or "clean up" unrelated code.
- **Don't commit secrets.** `.env` is gitignored — never hard-code backend hosts or
  credentials (use `VITE_API_PROXY_TARGET`). See `.env.example`.
- Note: adding routes requires the route tree to regenerate (run the dev server).

## 🐛 Reporting issues

Open a GitHub issue with steps to reproduce, the expected vs actual behaviour, and
relevant logs, console output, or screenshots (with any footage/credentials redacted).

## ✅ Pull request checklist

- [ ] I agree to the [CLA](CLA.md).
- [ ] Tests added/updated and passing.
- [ ] `npm run lint`, `npm test`, and `npm run build` all pass.
- [ ] The change works in both skins (Mission Control and Classic) where applicable.
- [ ] The change is focused and documented where it isn't self-evident.
