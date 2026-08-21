import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AA_NON_TEXT,
  AA_NORMAL,
  contrastRatio,
  parseTokenBlocks,
  relativeLuminance,
  type TokenBlock,
} from './contrast';

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('reproduces the four failures the 2026-08-21 UX review measured', () => {
    // These are the numbers this pass exists to fix; they double as proof the
    // implementation agrees with whatever tool the review used.
    // modern `text-text-dim` on `bg-void`
    expect(contrastRatio('#3d5066', '#050810')).toBeCloseTo(2.42, 2);
    // classic `text-text-dim` (zinc-400) on white
    expect(contrastRatio('#a1a1aa', '#ffffff')).toBeCloseTo(2.56, 2);
    // classic link (cyan-700) on white
    expect(contrastRatio('#0891b2', '#ffffff')).toBeCloseTo(3.68, 2);
    // white on the modern danger fill
    expect(contrastRatio('#ffffff', '#ff3366')).toBeCloseTo(3.55, 2);
  });

  it('is symmetric and accepts shorthand hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(contrastRatio('#fff', '#000'), 10);
  });

  it('rejects things that are not hex colours', () => {
    expect(() => relativeLuminance('rebeccapurple')).toThrow();
    expect(() => relativeLuminance('var(--bg)')).toThrow();
  });
});

describe('parseTokenBlocks', () => {
  it('collects hex declarations per marked block and ignores aliases', () => {
    const blocks = parseTokenBlocks(`
      :root {
        /* @tokens demo */
        --bg: #ffffff;
        --fg: #101010;
        --alias: var(--fg);
        --shadow: 0 1px 2px rgb(0 0 0 / 0.1);
      }
    `);
    expect(blocks.demo).toEqual({ '--bg': '#ffffff', '--fg': '#101010' });
  });
});

// ---------------------------------------------------------------------------
// The regression net: every token pair the UI puts text on must clear WCAG AA.
// Values are read from the real stylesheet, so editing a hex there is what
// this test guards.
// ---------------------------------------------------------------------------

// Vitest runs from the repo root; jsdom rewrites `import.meta.url` to http:.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const blocks = parseTokenBlocks(css);

/** Surfaces that text is ever laid on. */
const SURFACES = ['--bg', '--surface', '--surface-2', '--surface-3'] as const;
/** Every foreground level, weakest included — `--fg-faint` is the old
 *  `text-text-dim` (#3d5066, 2.4:1) that this pass exists to fix. */
const FOREGROUNDS = ['--fg', '--fg-muted', '--fg-dim', '--fg-faint'] as const;
/** Intent colours used as text (`text-crimson`, `text-emerald`, links…). */
const INTENTS = [
  '--accent',
  '--accent-dim',
  '--ok',
  '--ok-dim',
  '--warn',
  '--warn-dim',
  '--danger',
  '--danger-dim',
  '--info',
] as const;
/** Solid fills and the foreground painted on them. */
const SOLID_PAIRS = [
  ['--accent-fg', '--accent'],
  ['--accent-fg', '--accent-dim'],
  ['--ok-fg', '--ok'],
  ['--ok-fg', '--ok-dim'],
  ['--warn-fg', '--warn'],
  ['--warn-fg', '--warn-dim'],
  ['--danger-fg', '--danger'],
  ['--danger-fg', '--danger-dim'],
] as const;

function ratio(block: TokenBlock, a: string, b: string): number {
  const av = block[a];
  const bv = block[b];
  if (!av) throw new Error(`missing token ${a}`);
  if (!bv) throw new Error(`missing token ${b}`);
  return contrastRatio(av, bv);
}

const THEMES = ['modern-light', 'modern-dark', 'classic-light'] as const;

describe('index.css token blocks', () => {
  it('defines every theme this app can render', () => {
    for (const name of [...THEMES, 'modern-dark-pinned']) {
      expect(Object.keys(blocks[name] ?? {}).length, `${name} block`).toBeGreaterThan(10);
    }
  });

  it('keeps the two copies of the dark palette identical', () => {
    // The system-preference rule lives in a media query and the pinned rule
    // does not, so CSS forces the values to be written twice.
    expect(blocks['modern-dark-pinned']).toEqual(blocks['modern-dark']);
  });

  it('has no classic dark palette — classic is light-only by design', () => {
    expect(blocks['classic-dark']).toBeUndefined();
  });
});

describe.each(THEMES)('%s — WCAG AA', (theme) => {
  const block = () => blocks[theme];

  it.each(FOREGROUNDS.flatMap((fg) => SURFACES.map((bg) => [fg, bg] as const)))(
    '%s on %s reaches 4.5:1',
    (fg, bg) => {
      expect(ratio(block(), fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  // `--surface-3` is a raised chip/hover surface; intent colours are used as
  // text on the page and panel surfaces, which is what these check.
  it.each(INTENTS.flatMap((fg) => ['--bg', '--surface', '--surface-2'].map((bg) => [fg, bg] as const)))(
    '%s on %s reaches 4.5:1',
    (fg, bg) => {
      expect(ratio(block(), fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(SOLID_PAIRS)('%s on %s reaches 4.5:1', (fg, bg) => {
    expect(ratio(block(), fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  // WCAG 1.4.11: the focus indicator must be distinguishable from what it
  // sits on. Plain dividers (`--border`) are decorative and exempt.
  it.each(SURFACES)('the focus ring is visible on %s', (bg) => {
    expect(ratio(block(), '--accent', bg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

// The classic shell reproduces the legacy ZoneMinder navbar, whose colours
// are fixed by that design rather than by the skin's palette. They still have
// to be readable.
describe('classic navbar chrome — WCAG AA', () => {
  const nav = () => blocks['classic-nav'];

  it.each([
    ['--classic-nav-fg', '--classic-nav'],
    ['--classic-nav-link', '--classic-nav'],
    ['--classic-nav-brand', '--classic-nav'],
    ['--classic-nav-fg', '--classic-nav-deep'],
    ['--classic-nav-link', '--classic-nav-deep'],
  ])('%s on %s reaches 4.5:1', (fg, bg) => {
    expect(ratio(nav(), fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
