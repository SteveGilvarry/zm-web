/**
 * WCAG 2.1 contrast maths, plus a tiny parser for the token blocks in
 * `src/index.css`.
 *
 * The parser exists so the palette has a regression net: `contrast.test.ts`
 * reads the real stylesheet rather than a copy of it, so a hex edited in CSS
 * is checked by the test suite, not by eye. Token blocks are marked in the
 * stylesheet with a `/* @tokens <name> *\/` comment on the line above the
 * rule they open.
 */

/** `#rgb` / `#rrggbb` → `[r, g, b]` in 0–255. Throws on anything else. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA floors. Large = ≥18.66px bold or ≥24px. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
/** Non-text (icons, focus rings, control borders) — WCAG 1.4.11. */
export const AA_NON_TEXT = 3;

export type TokenBlock = Record<string, string>;

/**
 * Pull every `/* @tokens <name> *\/`-marked declaration block out of a
 * stylesheet. Only literal hex values are collected — tokens defined as
 * `var(...)` or `color-mix(...)` are aliases and carry no colour of their own.
 */
export function parseTokenBlocks(css: string): Record<string, TokenBlock> {
  const blocks: Record<string, TokenBlock> = {};
  const marker = /\/\*\s*@tokens\s+([\w-]+)\s*\*\//g;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(css)) !== null) {
    const name = m[1];
    // The block runs from the marker to the next marker, or to the closing
    // brace of the rule it sits in — whichever comes first.
    const rest = css.slice(m.index + m[0].length);
    const nextMarker = rest.search(/\/\*\s*@tokens\s/);
    const end = rest.indexOf('}');
    const stop = nextMarker === -1 ? end : Math.min(end === -1 ? rest.length : end, nextMarker);
    const body = rest.slice(0, stop === -1 ? rest.length : stop);
    const block: TokenBlock = {};
    for (const decl of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
      block[decl[1]] = decl[2];
    }
    blocks[name] = { ...blocks[name], ...block };
  }
  return blocks;
}
