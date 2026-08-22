# Contributing to zm-web

Thanks for your interest in improving zm-web! This guide covers how to get a change
merged.

## 📜 Contributor License Agreement

zm-web is **dual-licensed** — open source under [AGPL-3.0](LICENSE), and available
under a separate commercial license. For the project to be offered under both, every
contribution must be covered by the [Contributor License Agreement](CLA.md).

**By opening a pull request you agree to the [CLA](CLA.md)** for that and all future
contributions. You keep the copyright in your work — the CLA is a license grant, not an
assignment, that lets the maintainer license the project under both AGPL and commercial
terms. Please read it before contributing.

The **CLA Assistant** workflow checks this automatically: if you haven't signed, a bot
comments on your PR and the `CLA Assistant` status check fails. Reply on the PR with:

> I have read the CLA Document and I hereby sign the CLA

Your signature is then recorded in `signatures/version1/cla.json` (on the `cla-signatures`
branch) and the check passes. You only sign once — future PRs are recognised automatically.

### Maintainer note — branch protection

The CLA check only *blocks* a merge if it is a **required status check**. After the
workflow has run at least once, configure it under
**Settings → Branches → branch protection rule for `main`**:

- Enable **Require status checks to pass before merging** and add **`CLA Assistant`**.
- **Settings → Actions → General → Workflow permissions** must be **Read and write** so the
  action can commit signatures to the `cla-signatures` branch (already configured).

Without the required-check setting the CLA status is advisory only. Note: requiring a status
check (branch protection / rulesets) on a **private** repo needs **GitHub Pro** — it becomes
available for free once the repo is public. Until then the bot still comments and records
signatures; it just can't block the merge button.

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

- **Dual-skin first.** Every feature must work in both the **Modern** and
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
- [ ] The change works in both skins (Modern and Classic) where applicable.
- [ ] The change is focused and documented where it isn't self-evident.
