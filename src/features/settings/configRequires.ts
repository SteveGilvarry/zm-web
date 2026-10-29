import type { ZmConfig } from '@/types';

/**
 * `Config.Requires` and `source`, the two things besides permissions that
 * decide whether an option can be changed on the Options page.
 *
 * Requires is a `;`-separated list of `ZM_NAME=value` clauses that must
 * all hold (`ZM_OPT_USE_AUTH=1;ZM_AUTH_RELAY=hashed`). Legacy checks it
 * twice: in PHP when drawing the page (`options.php:284-311`) and again in
 * the page's script on load and on every change (`options.php:391-430`).
 * The script runs last, so its rules are the ones an operator sees:
 *
 * - a clause that is not `ZM_NAME=value` makes the whole thing unmet;
 * - an empty clause (a stray `;`) is skipped;
 * - values compare as strings, a checkbox reading `1` or `0`.
 *
 * A clause naming an option that does not exist is unmet (PHP's
 * "missing requirement"). Every Requires on a 1.39 box names an option in
 * the same tab, so the script's "only this tab's inputs" never differs
 * from looking at every option.
 */
const CLAUSE = /^(ZM_\w+)=(.+)$/;

export function requiresMet(
  requires: string | null | undefined,
  valueOf: (name: string) => string | undefined,
): boolean {
  if (!requires || !requires.trim()) return true;
  for (const chunk of requires.split(';')) {
    const part = chunk.trim();
    if (!part) continue;
    const m = CLAUSE.exec(part);
    if (!m) return false;
    const actual = valueOf(m[1]);
    if (actual === undefined || actual !== m[2]) return false;
  }
  return true;
}

/** Set in zm.conf or a conf.d file: those win over the database everywhere. */
export function isFileSet(config: Pick<ZmConfig, 'source'>): boolean {
  return config.source === 'file';
}

/**
 * A boolean written as a word in a conf file (`yes`, `on`, `true`…), as the
 * Config table would hold it (`configFileValue`, config.php.in:202). Other
 * types pass through.
 */
export function configFileValue(value: string, type: string): string {
  if (type !== 'boolean') return value;
  const word = value.trim().toLowerCase();
  if (word === 'yes' || word === 'true' || word === 'on') return '1';
  if (word === 'no' || word === 'false' || word === 'off') return '0';
  return value;
}

/** What a requirement reads for an option: a file's value wins over the row. */
export function effectiveConfigValue(config: Pick<ZmConfig, 'value' | 'type' | 'source'>): string {
  return isFileSet(config) ? configFileValue(config.value, config.type) : config.value;
}

/**
 * Why a row cannot be changed, in the order legacy decides it
 * (`$optionCanEdit = $canEdit && !System && !$fileSet`, then Requires):
 *
 * - `perm`: the user lacks System=Edit;
 * - `file`: zm.conf or conf.d sets it;
 * - `readonly`: a System row (or one the backend marks read-only);
 * - `requires`: an option it depends on is not set the way it needs;
 * - null: editable.
 */
export type ConfigLock = 'perm' | 'file' | 'readonly' | 'requires' | null;

export function configLock(
  config: Pick<ZmConfig, 'readonly' | 'requires' | 'source'>,
  canEdit: boolean,
  valueOf: (name: string) => string | undefined,
): ConfigLock {
  if (!canEdit) return 'perm';
  if (isFileSet(config)) return 'file';
  if (config.readonly === 1) return 'readonly';
  if (!requiresMet(config.requires, valueOf)) return 'requires';
  return null;
}
