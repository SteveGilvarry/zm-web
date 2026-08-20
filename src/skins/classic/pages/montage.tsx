import { useTranslation } from 'react-i18next';
import { AppShell } from '@/skins/AppShell';
import { MontageClassicGrid } from '@/features/montage/MontageClassicGrid';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { useMontageWallPage } from '@/features/montage/useMontagePage';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';

/** Montage — classic skin: flat preset grid of capturing monitors, no mosaic. */
export default function ClassicMontagePage() {
  const { t } = useTranslation();
  const page = useMontageWallPage();
  useDocumentTitle(t('Montage'));

  if (!page.isAuthenticated) return null;

  return (
    <AppShell title={t('Montage')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Montage')}</h1>

          {/* Shared filter bar — same dark panel treatment as the classic
              Console so the chrome looks consistent across classic-skin pages. */}
          <div className="bg-panel/95 rounded-lg border border-border-subtle p-3">
            <MonitorFilterBar monitors={page.monitors} onChange={page.setFilteredMonitors} />
          </div>

          <div dir="ltr">
            <MontageClassicGrid monitors={page.visibleMonitors} />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
