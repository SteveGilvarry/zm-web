#!/usr/bin/env node
/**
 * Rewrite physical Tailwind utilities to logical ones so layout mirrors
 * automatically under `dir="rtl"`.
 *
 *   node scripts/codemod-logical-css.mjs [--dry] [paths…]   (default: src)
 *
 * Only touches class-name contexts: string literals / template literals
 * inside `className=`, `clsx(`, `cn(`, `twMerge(` calls and plain string
 * literals that look like class lists. Variants (`hover:`, `md:`, `rtl:`)
 * and negatives (`-ml-2`) are preserved.
 *
 * Deliberately NOT rewritten (physical by nature — add `rtl:` variants by
 * hand where they are directional UI): `translate-x-*`, `inset-x-*`,
 * `scale-x-*`, `origin-*`, `space-x-*` (Tailwind v4 already flips it),
 * `divide-x-*`, `float-*`, `clear-*`, cursor names.
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const dry = process.argv.includes('--dry');
const roots = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (roots.length === 0) roots.push('src');

/** physical prefix → logical prefix. Order matters: longer first. */
const MAP = [
  ['rounded-tl-', 'rounded-ss-'], ['rounded-tr-', 'rounded-se-'],
  ['rounded-bl-', 'rounded-es-'], ['rounded-br-', 'rounded-ee-'],
  ['rounded-tl', 'rounded-ss'], ['rounded-tr', 'rounded-se'],
  ['rounded-bl', 'rounded-es'], ['rounded-br', 'rounded-ee'],
  ['rounded-l-', 'rounded-s-'], ['rounded-r-', 'rounded-e-'],
  ['rounded-l', 'rounded-s'], ['rounded-r', 'rounded-e'],
  ['border-l-', 'border-s-'], ['border-r-', 'border-e-'],
  ['border-l', 'border-s'], ['border-r', 'border-e'],
  ['scroll-ml-', 'scroll-ms-'], ['scroll-mr-', 'scroll-me-'],
  ['scroll-pl-', 'scroll-ps-'], ['scroll-pr-', 'scroll-pe-'],
  ['text-left', 'text-start'], ['text-right', 'text-end'],
  ['ml-', 'ms-'], ['mr-', 'me-'], ['pl-', 'ps-'], ['pr-', 'pe-'],
  ['left-', 'start-'], ['right-', 'end-'],
];

// A class token: optional variants (`a:b:`), optional `-`, then the utility.
const TOKEN = /(^|[\s"'`{])((?:[a-z0-9-]+:)*)(-?)([a-z][a-z0-9-]*(?:\[[^\]]*\])?(?:\/[0-9.]+)?)/g;

function rewriteClassList(s) {
  return s.replace(TOKEN, (whole, lead, variants, neg, util) => {
    for (const [from, to] of MAP) {
      if (util === from || (from.endsWith('-') && util.startsWith(from))) {
        // guard: `left-`/`right-` only as positioning utilities, not e.g. `left-arrow`
        if ((from === 'left-' || from === 'right-') && !/^(left|right)-(\d|\[|auto|full|px|1\/|2\/|3\/)/.test(util)) return whole;
        // `left-1/2 -translate-x-1/2` centres an element; that is symmetric and
        // must stay physical (start-1/2 + translate would be off-centre in RTL).
        if ((from === 'left-' || from === 'right-') && /^(left|right)-1\/2$/.test(util)) return whole;
        return `${lead}${variants}${neg}${to}${util.slice(from.length)}`;
      }
    }
    return whole;
  });
}

// Only rewrite inside string/template literals that look like class lists.
const LITERAL = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
function looksLikeClassList(s) {
  return /\b(?:m|p)[lr]-|\b(?:left|right)-|text-(?:left|right)|rounded-(?:[lr]|t[lr]|b[lr])|border-[lr]\b|border-[lr]-/.test(s);
}

function processFile(file) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(LITERAL, (m, q, body) =>
    looksLikeClassList(body) ? `${q}${rewriteClassList(body)}${q}` : m,
  );
  if (after !== before) {
    if (!dry) writeFileSync(file, after);
    return true;
  }
  return false;
}

function walk(p, out = []) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (e === 'node_modules' || e === 'dist' || e.endsWith('.gen.ts')) continue;
      walk(join(p, e), out);
    }
  } else if (['.tsx', '.ts'].includes(extname(p)) && !/\.test\.tsx?$/.test(p)) out.push(p);
  return out;
}

const files = roots.flatMap((r) => walk(r));
const changed = files.filter(processFile);
console.log(`${dry ? '[dry] ' : ''}${changed.length}/${files.length} files ${dry ? 'would change' : 'rewritten'}`);
for (const f of changed) console.log('  ' + f);
