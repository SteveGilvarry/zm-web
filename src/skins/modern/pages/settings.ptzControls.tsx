import { Trans, useTranslation } from 'react-i18next';
import { Joystick, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { summarizeCapabilities } from '@/api/controls';
import { usePtzControlsPage } from '@/features/controls/usePtzControlsPage';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Settings → PTZ control protocols — Mission Control. */
export default function SettingsPtzControlsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('PTZ Controls'));
  const { isLoading, controls, pendingDelete, requestDelete, cancelDelete, confirmDelete } =
    usePtzControlsPage();

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <Panel
          title={t('PTZ control protocols')}
          icon={<Joystick size={16} />}
        >
          <p className="text-xs text-text-muted mb-3">
            <Trans>
              Each row is a PTZ-protocol definition the system can drive. Monitors
              reference one via <code>control_id</code> on the Control tab of the
              monitor editor. Editing the full capability matrix (50+ flags) is
              deferred — for now this page is read-only with a delete escape hatch.
            </Trans>
          </p>

          {isLoading ? (
            <div className="p-8 text-center text-text-muted">{t('Loading…')}</div>
          ) : controls.length === 0 ? (
            <div className="p-8 text-center text-text-muted italic">
              {t('No PTZ control protocols defined.')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted border-b border-border-subtle">
                <tr>
                  <th className="text-start px-2 py-2 w-12">{t('ID')}</th>
                  <th className="text-start px-2 py-2">{t('Name')}</th>
                  <th className="text-start px-2 py-2">{t('Type')}</th>
                  <th className="text-start px-2 py-2">{t('Capabilities')}</th>
                  <th className="text-end px-2 py-2 w-20">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {controls.map((c) => (
                  <tr key={c.id} className="border-b border-border-subtle/40 hover:bg-surface/40">
                    <td className="px-2 py-2 font-mono tabular-nums text-text-muted">{c.id}</td>
                    <td className="px-2 py-2 text-text-primary">{c.name}</td>
                    <td className="px-2 py-2 text-text-muted">{c.type}</td>
                    <td className="px-2 py-2 text-text-secondary text-xs">
                      {summarizeCapabilities(c)}
                    </td>
                    <td className="px-2 py-2 text-end">
                      <button
                        type="button"
                        onClick={() => requestDelete(c)}
                        className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                        aria-label={t('Delete {{name}}', { name: c.name })}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {pendingDelete && (
        <div
          role="dialog"
          aria-label={t('Confirm delete')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={cancelDelete}
        >
          <div
            className="bg-panel border border-border-subtle rounded-lg p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text-primary mb-2">
              {t('Delete "{{name}}"?', { name: pendingDelete.name })}
            </h3>
            <p className="text-xs text-text-muted mb-4">
              <Trans>
                Any monitor whose <code>control_id</code> points at this row will
                lose PTZ wiring until reassigned.
              </Trans>
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={cancelDelete}
                className="px-3 py-1.5 text-xs rounded border border-border-subtle text-text-muted hover:bg-surface"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-3 py-1.5 text-xs rounded border border-crimson/50 bg-crimson/15 text-crimson hover:bg-crimson/25"
              >
                {t('Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
