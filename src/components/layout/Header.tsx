import { WifiOff, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/api/base';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getVersion } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { SystemRunningToggle } from '@/components/system/SystemRunningToggle';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { Button } from '@/components/common/Button';

interface HeaderProps {
  title?: string;
  /** Opens the mobile navigation drawer; renders the menu button when set. */
  onMenu?: () => void;
  menuOpen?: boolean;
}

/**
 * The application header.
 *
 * It used to carry a four-reading telemetry strip with a hover tooltip on
 * every page. Telemetry belongs to the page that is about the system — the
 * console's status line and its system disclosure — not to the chrome above
 * every page (docs/DESIGN.md). What is left here is what is true everywhere:
 * where you are, whether the backend is reachable, whether ZoneMinder is
 * running, and the wall clock an operator timestamps against.
 */
export function Header({ title, onMenu, menuOpen = false }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? undefined;
  const { isAuthenticated } = useAuthStore();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Connectivity check against the API health endpoint
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch(`${API_BASE}/server/health_check`, { method: 'GET' });
        setIsConnected(response.ok);
      } catch {
        setIsConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  const { data: version } = useQuery({
    queryKey: ['version'],
    queryFn: getVersion,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  return (
    <header className="h-12 bg-surface border-b border-border-subtle flex items-center justify-between px-3 sm:px-4 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {onMenu && (
          <Button
            variant="ghost"
            icon
            onClick={onMenu}
            aria-label={t('Open menu')}
            aria-controls="app-sidebar"
            aria-expanded={menuOpen}
            className="lg:hidden -ms-1"
          >
            <Menu size={20} aria-hidden />
          </Button>
        )}
        {title && (
          <h1 className="text-base font-semibold text-fg truncate">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* A green "Connected" badge on every page is decoration; only the
            failure is worth space, and it takes the alert colour. */}
        {!isConnected && (
          <span className="flex items-center gap-1.5 text-sm text-danger">
            <WifiOff size={14} aria-hidden />
            {t('Disconnected')}
          </span>
        )}

        {isAuthenticated && (
          <RequirePerm feature="system" level="Edit">
            <SystemRunningToggle />
          </RequirePerm>
        )}

        <span className="hidden sm:flex items-baseline gap-2 font-mono tabular-nums">
          <span className="text-sm text-fg">
            {currentTime.toLocaleTimeString(locale, {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          <span className="text-xs text-fg-dim">
            {currentTime.toLocaleDateString(locale, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
            {version?.version ? ` · v${version.version}` : ''}
          </span>
        </span>
      </div>
    </header>
  );
}
