import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Home, RefreshCw, SearchX } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { apiErrorMessage, classifyApiError } from '@/api/client';
import { Button } from './Button';
import { buttonClasses } from './styles';

/**
 * Router `defaultErrorComponent`: a route's loader or component threw.
 * Rendered inside the active skin's shell so the nav stays usable.
 */
export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const kind = classifyApiError(error);
  const retry = () => {
    reset();
    void router.invalidate();
  };
  const heading =
    kind === 'forbidden'
      ? t('You do not have permission to view this.')
      : kind === 'network' || kind === 'server'
        ? t('Cannot reach the server.')
        : t('This page failed to load.');

  return (
    <AppShell title={t('Error')}>
      <FallbackBody
        icon={<AlertTriangle size={28} className="text-danger" aria-hidden />}
        heading={heading}
        detail={kind === 'forbidden' ? undefined : apiErrorMessage(error)}
        actions={
          <>
            {kind !== 'forbidden' && (
              <Button size="sm" onClick={retry}>
                <RefreshCw size={14} aria-hidden />
                {t('Retry')}
              </Button>
            )}
            <Link to="/" className={BUTTON}>
              <Home size={14} aria-hidden />
              {t('Go to console')}
            </Link>
          </>
        }
      />
    </AppShell>
  );
}

/** Router `defaultNotFoundComponent`. */
export function NotFoundFallback() {
  const { t } = useTranslation();
  return (
    <AppShell title={t('Not found')}>
      <FallbackBody
        icon={<SearchX size={28} className="text-warn" aria-hidden />}
        heading={t('There is no page at this address.')}
        actions={
          <Link to="/" className={BUTTON}>
            <Home size={14} aria-hidden />
            {t('Go to console')}
          </Link>
        }
      />
    </AppShell>
  );
}

/**
 * Root `ErrorBoundary` fallback: something above the router (or the router
 * itself) threw. No shell, no router hooks — plain anchors only.
 */
export function AppCrashFallback({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-bg text-fg flex items-center justify-center p-6">
      <FallbackBody
        icon={<AlertTriangle size={28} className="text-danger" aria-hidden />}
        heading={t('The dashboard hit an error it could not recover from.')}
        detail={error.message}
        actions={
          <>
            <Button size="sm" onClick={reset}>
              <RefreshCw size={14} aria-hidden />
              {t('Try again')}
            </Button>
            <a href={import.meta.env.BASE_URL} className={BUTTON}>
              <Home size={14} aria-hidden />
              {t('Go to console')}
            </a>
          </>
        }
      />
    </div>
  );
}

/** `<Link>` / `<a>` can't be a `<Button>`, so they borrow its recipe. */
const BUTTON = buttonClasses('secondary', 'sm');

function FallbackBody({
  icon,
  heading,
  detail,
  actions,
}: {
  icon: React.ReactNode;
  heading: string;
  detail?: string;
  actions: React.ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      {icon}
      <h2 className="text-lg font-semibold">{heading}</h2>
      {detail && <p className="text-label text-fg-dim font-mono break-all max-w-xl">{detail}</p>}
      <div className="flex items-center gap-2 mt-2">{actions}</div>
    </div>
  );
}
