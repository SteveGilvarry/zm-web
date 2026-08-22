#!/usr/bin/env node
/**
 * Fail the build when the initial download grows past its budget.
 *
 * The number that matters is not the largest chunk, it is what a browser
 * must fetch before the login page can render: the entry module, everything
 * `index.html` preloads with it, and the stylesheet. Lazy route chunks and
 * `hls.js` are deliberately excluded — they are the reason the entry is
 * small, and counting them would punish the split that made it so.
 *
 * Budgets are gzip bytes, which is what goes over the wire. Raise them
 * deliberately in a commit that says why, never to make CI green.
 */
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist';
/** Gzipped bytes the first paint is allowed to cost. */
const BUDGET_JS = 200 * 1024;
const BUDGET_CSS = 18 * 1024;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const assets = (re) => [...html.matchAll(re)].map((m) => m[1]).filter((h) => h.startsWith('/assets/'));

const js = new Set([
  ...assets(/<script[^>]+src="([^"]+)"/g),
  ...assets(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
]);
const css = new Set(assets(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g));

const gzipOf = (href) => {
  const path = join(DIST, href.replace(/^\//, ''));
  statSync(path);
  return gzipSync(readFileSync(path)).length;
};
const sum = (hrefs) => [...hrefs].reduce((n, h) => n + gzipOf(h), 0);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const jsBytes = sum(js);
const cssBytes = sum(css);

for (const href of [...js].sort()) console.log(`  ${href}  ${kb(gzipOf(href))} gz`);
console.log(`initial JS  ${kb(jsBytes)} gz  (budget ${kb(BUDGET_JS)})`);
console.log(`initial CSS ${kb(cssBytes)} gz  (budget ${kb(BUDGET_CSS)})`);

const over = [];
if (jsBytes > BUDGET_JS) over.push(`JS ${kb(jsBytes)} > ${kb(BUDGET_JS)}`);
if (cssBytes > BUDGET_CSS) over.push(`CSS ${kb(cssBytes)} > ${kb(BUDGET_CSS)}`);
if (over.length) {
  console.error(`\nbundle-budget: initial payload over budget — ${over.join('; ')}`);
  console.error('Either shrink it (lazy-load the new dependency) or raise the budget in this file with a reason.');
  process.exit(1);
}
console.log('bundle-budget: within budget.');
