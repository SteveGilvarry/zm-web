#!/usr/bin/env node
/**
 * Per-file coverage floor.
 *
 * `vitest.config.ts` sets the aggregate release bar (85/75/85/85). It cannot
 * also express "and no single file may go untested": `thresholds.perFile`
 * applies the *global* numbers to every file, and a glob group is evaluated
 * as an aggregate — its `perFile` is ignored. So the floor lives here and
 * runs after `vitest --coverage`.
 *
 *   npm run coverage:floor            # reads coverage/coverage-summary.json
 *
 * The floor is deliberately far below the aggregate bar: one uncovered guard
 * in a small module should not block a PR; a module nobody tested should.
 */
import { readFileSync } from 'node:fs';

const FLOOR = { lines: 50, statements: 50, functions: 40, branches: 25 };
const SUMMARY = 'coverage/coverage-summary.json';

let summary;
try {
  summary = JSON.parse(readFileSync(SUMMARY, 'utf8'));
} catch {
  console.error(`coverage-floor: ${SUMMARY} not found — run \`vitest run --coverage\` first.`);
  process.exit(1);
}

const failures = [];
for (const [file, metrics] of Object.entries(summary)) {
  if (file === 'total') continue;
  // A file with no statements (types, barrels) cannot be covered.
  if (metrics.statements.total === 0) continue;
  const under = Object.entries(FLOOR)
    .filter(([metric, min]) => metrics[metric].total > 0 && metrics[metric].pct < min)
    .map(([metric, min]) => `${metric} ${metrics[metric].pct.toFixed(1)}% < ${min}%`);
  if (under.length) failures.push({ file: file.replace(`${process.cwd()}/`, ''), under });
}

if (failures.length === 0) {
  const n = Object.keys(summary).length - 1;
  console.log(`coverage-floor: ${n} files, all above ${FLOOR.lines}% lines / ${FLOOR.branches}% branches.`);
  process.exit(0);
}

console.error(`coverage-floor: ${failures.length} file(s) below the floor\n`);
for (const { file, under } of failures) console.error(`  ${file}\n      ${under.join(', ')}`);
console.error('\nAdd tests, or delete the module if nothing uses it.');
process.exit(1);
