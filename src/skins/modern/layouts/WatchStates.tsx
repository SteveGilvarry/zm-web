import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { VideoOff } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';

/** Watch page while the monitor record is loading. Both skins show this. */
export function WatchLoading() {
  const { t } = useTranslation();
  return (
    <AppShell title={t('Loading...')}>
      <main className="flex-1 p-6 overflow-auto">
        <div className="animate-pulse space-y-6">
          <div className="aspect-video bg-surface rounded-xl" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-32 bg-surface rounded-xl" />
            <div className="h-32 bg-surface rounded-xl" />
            <div className="h-32 bg-surface rounded-xl" />
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
      <main className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center">
          <VideoOff size={64} className="mx-auto mb-4 text-text-muted" />
          <h2 className="text-xl font-bold text-text-primary mb-2">{t('Monitor Not Found')}</h2>
          <p className="text-text-muted mb-6">{t('The requested monitor could not be found.')}</p>
          <Link
            to="/monitors"
            className="px-6 py-3 bg-cyan text-void font-medium rounded-lg hover:bg-cyan-dim transition-colors"
          >
            {t('Back to Monitors')}
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
