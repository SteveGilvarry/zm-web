# Skins

A skin is a complete look for the dashboard: its own chrome, its own page
layouts, its own design tokens. Every skin renders the same data through the
same hooks — `src/features/**` and `src/api/**` are skin-agnostic and never
branch on the active skin.

```
src/skins/
  types.ts          SkinDefinition, PageKey, PagePropsMap — the contract
  registry.ts       skins map, useSkin(), resolvePage(), fallback rules
  SkinPage.tsx      <SkinPage page="events.list" /> — what routes render
  AppShell.tsx      wraps content in the active skin's Shell, sets <html class>
  discoverPages.ts  pages/*.tsx → page map (filename is the page key)
  modern/
    index.ts        SkinDefinition for "Mission Control"
    Shell.tsx       sidebar + header chrome
    pages/          one file per PageKey: console.tsx, events.list.tsx, …
  classic/
    index.ts        SkinDefinition for "Classic ZoneMinder"
    Shell.tsx       top nav + stat strip chrome
    shell/          TopNav, StatBar
    pages/          same keys; a missing file falls back to modern's page
```

## Rules

1. **Routes are thin.** `src/routes/**` only declares the URL, parses params,
   and renders `<SkinPage page="…" {...params} />`. No JSX, no data, no
   `useUiStore(s => s.skin)` in a route file.
2. **Data lives in features.** A page gets everything from a
   `src/features/<feature>/use<Page>Page.ts` hook (queries, mutations,
   derived state, handlers). Two skins' pages call the same hook.
3. **Pages are per skin.** `src/skins/<id>/pages/<key>.tsx`, default export,
   props from `PagePropsMap[key]`. Adding the file is the registration.
4. **Fallback is loud.** A skin without a page for a key renders the fallback
   skin's page wrapped in `data-skin-fallback`; dev builds warn. The coverage
   test in `registry.test.ts` keeps an explicit allow-list of missing pages so
   the gap only ever shrinks on purpose.
5. **Tokens, not colours.** Components use semantic token classes
   (`bg-surface`, `text-text-primary`, `border-border`). Each skin binds the
   tokens under its `rootClass` in `src/index.css`. A skin may also ship its
   own primitives (tables, buttons) when the semantics differ from the
   shared ones — classic's Bootstrap-flat tables are the example.
6. **Direction-safe.** Use logical utilities (`ms-`, `pe-`, `start-`,
   `text-start`). Physical media — video stages, timelines, PTZ pads — are
   wrapped in `dir="ltr"`.

## Adding a skin

1. `src/skins/<id>/index.ts` exporting a `SkinDefinition` (`id`, `name`,
   `description`, `rootClass`, `colorSchemes`, `Shell`,
   `pages: discoverPages(import.meta.glob('./pages/*.tsx'))`).
2. Add the id to `SkinId` in `types.ts` and the entry to `skins` in
   `registry.ts`.
3. Bind tokens for `.skin-<id>` in `src/index.css`.
4. Add pages as you go; until then the fallback covers you, visibly.

## Adding a page

1. Add the key to `PageKey` and its props to `PagePropsMap` in `types.ts`.
2. Write the data hook in `src/features/...`.
3. Create `src/skins/modern/pages/<key>.tsx` (the fallback must exist) and,
   when it has its own layout, `src/skins/classic/pages/<key>.tsx`.
4. Create the route file rendering `<SkinPage page="<key>" />`.
5. Update the allow-list in `registry.test.ts` if the classic page is deferred.
