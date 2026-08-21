# Modern skin — design

The modern skin is a **content-first ops console**. The cameras are the
content; everything else is chrome and should get out of their way.

Mission Control, the skin this replaces, broke that: neon cyan, gradient
stat tiles and glowing panels competed with the video for attention, and
because colour was decorative there was nothing left to say "this camera is
in alarm". The direction below fixes the cause, not the symptoms.

## Principles

1. **Video is the only saturated thing on screen.** Chrome is near
   monochrome. A wall of sixteen cameras should look like sixteen cameras,
   not like sixteen cameras inside a light show.
2. **Colour means state, never decoration.** Alarm, recording, warning,
   offline, ok — those are the only things allowed to be saturated, and they
   appear as small marks (a dot, a pill, a left border), never as the fill
   of a large surface. If a tile is red, something is wrong; if nothing is
   wrong, the screen is grey.
3. **The accent is quiet.** It marks what is interactive and what is
   selected. It is a muted steel blue, not a highlighter.
4. **Density over decoration.** An operator scans lists. Tables beat cards:
   the events list shows twenty rows, not three and a half.
5. **Type is for reading.** System UI at 13–14 px, sentence case. Monospace
   is reserved for data that lines up — fps, byte counts, ids, timestamps —
   with `tabular-nums`. No 10 px uppercase letter-spaced labels.
6. **Dark first, light real.** Control rooms run dark; a bright office does
   not. Both themes are designed, not inverted.

## Tokens

Semantic only — components never name a colour. Defined per theme in
`src/index.css` and asserted at AA by `src/lib/contrast.test.ts`.

| token | role |
|---|---|
| `--bg`, `--bg-sunken` | page ground; sunken for wells behind content |
| `--surface`, `--surface-2`, `--surface-3` | panels, rows, raised controls |
| `--border`, `--border-subtle` | separators; subtle is for inside a panel |
| `--fg`, `--fg-muted`, `--fg-dim`, `--fg-faint` | text, in falling emphasis |
| `--accent`, `--accent-dim`, `--accent-fg` | interactive + selected |
| `--ok`, `--warn`, `--danger`, `--info` | **state only** |

Status aliases (`--status-alarm`, `--status-recording`, …) map onto the
intent scale so a monitor's state has one definition.

## Components

Pages compose the primitives in `src/components/common` — `Button`,
`TextField`, `Select`, `Textarea`, `Checkbox`, `Badge`, `Chip` — rather than
hand-rolling class strings. A page that needs a one-off style is a sign the
primitive is missing a variant.

Forbidden in pages: raw colour classes (`cyan-*`, `emerald-*`…), gradients,
glow shadows, `text-[10px]`, uppercase tracking on data labels.

## Classic skin

None of this applies. Classic is a faithful reproduction of ZoneMinder
1.39's UI, down to quirks like `human_filesize()` printing the literal
string `null`. It is judged against the legacy screenshots, not against
this document.
