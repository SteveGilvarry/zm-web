import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { ManualActionsState } from './useManualActions';

/** How long a failed action stays on screen. */
const ERROR_TTL_MS = 6_000;

/**
 * control_functions.php `monitorActionControls`: one button per enabled
 * `Manual` action, at the top of the control panel. A failure is shown
 * under the buttons for a few seconds, as legacy alerts the control
 * response.
 */
export function MonitorActionButtons({ state }: { state: ManualActionsState }) {
  const { t } = useTranslation();
  const [error, setError] = useState<{ text: string } | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), ERROR_TTL_MS);
    return () => clearTimeout(id);
  }, [error]);

  if (state.actions.length === 0) return null;

  const fire = (id: number, label: string) => {
    setPending(id);
    state.run(id)
      .catch((err: unknown) => {
        const detail = err instanceof Error && err.message ? err.message : t('command failed');
        setError({ text: t('{{command}}: {{detail}}', { command: label, detail }) });
      })
      .finally(() => setPending(null));
  };

  return (
    <div className="space-y-2" data-testid="monitor-actions">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Actions')}>
        {state.actions.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => fire(a.id, a.label)}
            disabled={pending === a.id}
            title={a.label}
            className="px-2.5 py-1.5 rounded border border-border bg-surface-2 text-fg-muted text-xs select-none transition-colors hover:text-fg hover:bg-surface-3 disabled:opacity-50"
          >
            {a.label}
          </button>
        ))}
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-danger/30 bg-danger/12 text-danger text-xs"
        >
          <AlertTriangle size={12} className="flex-shrink-0" aria-hidden />
          <span className="truncate">{error.text}</span>
        </div>
      )}
    </div>
  );
}
