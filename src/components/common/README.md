# Shared UI primitives

`Button`, `TextField`, `Select`, `Textarea`, `Checkbox`, `Badge`, `Chip` —
plus the class recipes they are built from in `styles.ts`.

They exist so the a11y and contrast work lands once instead of 189 times.
Every one of them:

- speaks only **semantic tokens** (`bg-surface`, `text-fg-dim`, `bg-accent`,
  `text-danger-fg` …), so it renders correctly in modern light, modern dark
  and classic without asking which skin is active;
- inherits the single `:focus-visible` ring from `src/index.css` rather than
  drawing its own;
- uses `text-label` (12px, normal case) for data labels instead of the old
  10px uppercase letter-spaced mono;
- keeps the native element underneath — a real `<button>`, `<input>`,
  `<select>` — so keyboard and screen-reader behaviour is the browser's, not
  ours.

## Status: adopted in the chrome, not yet in the pages

Phase 2 deliberately stopped at the shared shell:

- adopted — `src/components/common/*`, `src/components/layout/*`,
  `src/skins/*/shell/*`, `Modal` / `ConfirmDialog`;
- **not yet** — the page components under `src/skins/modern/pages/`,
  `src/skins/classic/pages/` and `src/features/**`, which still style ~189
  `<button>`, ~76 `<input>` and ~32 `<select>` inline.

That was a scheduling call, not a design one: page tests were being written
against those files in parallel and swapping their markup mid-flight would
have broken them. **Adopting the primitives across the pages is the next
pass.** Until then, a page that cannot switch yet can still import the same
recipes from `styles.ts` (`buttonClasses('primary', 'md')`) so the look does
not fork.

## Using them

```tsx
import { Button } from '@/components/common/Button';
import { TextField } from '@/components/common/TextField';
import { Badge } from '@/components/common/Badge';

<Button variant="primary" onClick={save}>{t('Save')}</Button>
<Button variant="danger" size="sm" onClick={remove}>{t('Delete')}</Button>
<Button variant="ghost" icon aria-label={t('Close')}><X size={18} /></Button>

<TextField label={t('Name')} value={name} onChange={(e) => setName(e.target.value)} />
<TextField label={t('Port')} error={portError} inputMode="numeric" />

<Badge tone="ok">{t('Running')}</Badge>
```

`variant` defaults to `secondary` and `size` to `md`. `icon` swaps the
horizontal padding for square padding — always pair it with `aria-label`, or
the button has no accessible name.

## Rules

1. **No raw hex, no `zinc-*`/`cyan-*` Tailwind palette colours.** If a colour
   is missing, add a semantic token in `src/index.css` and a pair assertion in
   `src/lib/contrast.test.ts`. That test parses the stylesheet, so a token
   that fails AA fails the build.
2. **Never `outline-none` without a replacement ring.** The base rule in
   `index.css` covers every focusable element; opting out is opting out of
   keyboard use.
3. **Colour is never the only signal.** `Chip` carries `aria-pressed`,
   `Badge` carries text, status dots carry a label.
4. **Motion is decorative.** Anything under `prefers-reduced-motion: reduce`
   is switched off in `index.css`; do not re-add animation inline.
