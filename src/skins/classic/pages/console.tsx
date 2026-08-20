import { useTranslation } from 'react-i18next';
import { AppShell } from '@/skins/AppShell';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { ConsoleClassicTable } from '@/features/console/ConsoleClassicTable';
import { useConsolePage } from '@/features/console/useConsolePage';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';

/** Console — classic skin: legacy ZM table layout (sortable monitor rows). */
export default function ClassicConsolePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Console'));
  const page = useConsolePage();

  if (!page.isAuthenticated) return null;

  // Mirror the modern skin: feed the unfiltered list into the bar, swap in
  // the filtered list when rendering the table. The bar styling is dark
  // ("Mission Control" panel) but contrasts cleanly against the light
  // classic page background.
  return (
    <AppShell title={t('Console')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Console')}</h1>
          <div className="bg-panel/95 rounded-lg border border-border-subtle p-3">
            <MonitorFilterBar monitors={page.data.monitors} onChange={page.setFilteredMonitors} />
          </div>
          <ConsoleClassicTable data={page.filteredData} />
        </div>
      </main>
    </AppShell>
  );
}
