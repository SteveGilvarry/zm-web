import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { VideoOff } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';

/** Watch page while the monitor record is loading. Both skins show this. */
export function WatchLoading() {
  const { t } = useTranslation();
  return (
    <AppShell title={t('Loading...')}>
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="h-11 shrink-0 border-b border-border-subtle bg-surface" />
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 p-2">
            <div className="w-full h-full rounded bg-surface" />
          </div>
          <div className="w-[22rem] shrink-0 border-s border-border-subtle p-3 space-y-3">
            <div className="h-24 rounded bg-surface" />
            <div className="h-40 rounded bg-surface" />
            <div className="h-32 rounded bg-surface" />
          </div>
        </div>
      </main>
    </AppShell>
  );
}

/** Watch page when the monitor does not exist. Both skins show this. */
export function WatchNotFound() {
  const { t } = useTranslation();
  return (
    <AppShell title={t('Monitor Not Found')}>
      <main className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="text-center">
          <VideoOff size={48} className="mx-auto mb-4 text-fg-faint" aria-hidden />
          <h2 className="text-lg font-medium text-fg mb-2">{t('Monitor Not Found')}</h2>
          <p className="text-sm text-fg-dim mb-6">{t('The requested monitor could not be found.')}</p>
          <Link
            to="/monitors"
            className="inline-block px-4 py-2 rounded bg-accent text-accent-fg text-sm hover:bg-accent-dim transition-colors"
          >
            {t('Back to Monitors')}
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
