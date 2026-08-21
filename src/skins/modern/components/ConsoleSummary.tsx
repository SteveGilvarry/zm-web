import { clsx } from 'clsx';
import type { ReactNode } from 'react';

/**
 * The console's overview line.
 *
 * This replaces four gradient-filled, glowing stat cards. Per `docs/DESIGN.md`
 * the chrome must not compete with the cameras, and colour has to mean
 * something: these figures are ordinary readings, so they are plain text, and
 * the only thing allowed to take a colour is a value that has crossed a
 * threshold (disk filling up) or a live state (cameras recording).
 */

export interface SummaryStat {
  label: string;
  value: string | number;
  /** Second line — units, or a breakdown of the value. */
  detail?: string;
  /** Colour only when the reading itself is the message. */
  tone?: 'normal' | 'ok' | 'warn' | 'danger';
  /** Small state mark before the value (a recording dot, say). */
  mark?: ReactNode;
}

const toneClass: Record<NonNullable<SummaryStat['tone']>, string> = {
  normal: 'text-fg',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
};

export function ConsoleSummary({ stats, label }: { stats: SummaryStat[]; label: string }) {
  return (
    <section
      aria-label={label}
      className="mb-5 flex flex-wrap items-start gap-x-10 gap-y-4 rounded-lg border border-border-subtle bg-surface px-5 py-4"
    >
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5">
          <span className="text-xs text-fg-dim">{s.label}</span>
          <span className="flex items-baseline gap-2">
            {s.mark}
            <span
              className={clsx(
                'text-2xl font-mono tabular-nums leading-none',
                toneClass[s.tone ?? 'normal'],
              )}
            >
              {s.value}
            </span>
          </span>
          {s.detail && <span className="text-xs text-fg-faint">{s.detail}</span>}
        </div>
      ))}
    </section>
  );
}
