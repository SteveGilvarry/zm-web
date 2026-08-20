import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { summarizeCapabilities } from '@/api/controls';
import { usePtzControlsPage } from '@/features/controls/usePtzControlsPage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { OptionsRail } from '../components/settings/OptionsRail';

const btn = 'px-2 py-0.5 text-xs border border-zinc-500 rounded-sm bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40';

/** Options → Control — classic skin: the legacy PTZ control-protocol table. */
export default function ClassicSettingsPtzControlsPage() {
  const { t } = useTranslation();
  const { isLoading, controls, pendingDelete, requestDelete, cancelDelete, confirmDelete } = usePtzControlsPage();
  const tabs = useOptionsTabs();
  useDocumentTitle(t('PTZ Controls'));

  return (
    <AppShell title={t('PTZ Controls')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="control" />
            <div className="flex-1 min-w-0 space-y-3">
              <p className="text-xs text-zinc-600">
                {t('Each row is a PTZ-protocol definition a monitor can reference from its Control tab. Editing the capability matrix is deferred; this page is read-only with delete.')}
              </p>
              <div className="bg-white rounded border border-zinc-300 overflow-hidden">
                {isLoading ? (
                  <div className="p-8 text-center text-zinc-500 text-sm">{t('Loading…')}</div>
                ) : controls.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-sm italic">{t('No PTZ control protocols defined.')}</div>
                ) : (
                  <table className="w-full text-sm text-zinc-800">
                    <thead className="bg-zinc-100 border-b border-zinc-300 text-xs">
                      <tr>
                        <th className="px-3 py-2 text-start font-semibold w-12">{t('ID')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Name')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Type')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Capabilities')}</th>
                        <th className="px-3 py-2 text-end font-semibold">{t('Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {controls.map((c) => (
                        <tr key={c.id} className="border-b border-zinc-200 hover:bg-zinc-50">
                          <td className="px-3 py-1.5 font-mono tabular-nums text-zinc-500">{c.id}</td>
                          <td className="px-3 py-1.5">{c.name}</td>
                          <td className="px-3 py-1.5 text-zinc-600">{c.type}</td>
                          <td className="px-3 py-1.5 text-xs text-zinc-600">{summarizeCapabilities(c)}</td>
                          <td className="px-3 py-1.5 text-end">
                            <button type="button" onClick={() => requestDelete(c)} aria-label={t('Delete {{name}}', { name: c.name })} className={btn}>
                              {t('Delete')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        title={pendingDelete ? t('Delete "{{name}}"?', { name: pendingDelete.name }) : ''}
        message={t('Any monitor whose control_id points at this row will lose PTZ wiring until reassigned.')}
        confirmText={t('Delete')}
        variant="danger"
      />
    </AppShell>
  );
}
