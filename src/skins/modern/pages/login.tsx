import { Shield, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';
import { fieldClasses, LABEL } from '@/components/common/styles';
import { useLoginPage } from '@/features/auth/useLoginPage';
import { useDocumentTitle } from '../layouts/useDocumentTitle';
import { version as appVersion } from '../../../../package.json';

/**
 * Login — the modern skin. Renders no AppShell.
 *
 * One card on an empty ground: no grid, no radial wash, no glow behind the
 * panel. Nothing on this page has a state worth colouring except the two
 * messages, so the rest is type on a surface (docs/DESIGN.md).
 */
export default function LoginPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Sign In'));
  const l = useLoginPage();

  return (
    <div className="min-h-screen bg-bg-sunken flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-border-subtle bg-surface p-8">
          <div className="flex flex-col items-center mb-8">
            <Shield className="text-fg-dim mb-3" size={28} aria-hidden />
            <h1 className="text-xl font-semibold text-fg">ZoneMinder</h1>
            <p className="mt-1 text-sm text-fg-dim">
              {t('Sign in to your surveillance system')}
            </p>
          </div>

          {l.notice && (
            <div role="status" className="mb-5 flex items-start gap-2 rounded border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>{l.notice}</span>
            </div>
          )}

          {l.error && (
            <div className="mb-5 flex items-start gap-2 rounded border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>{l.error}</span>
            </div>
          )}

          <form onSubmit={l.handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className={LABEL}>{t('Username')}</label>
              <input
                id="username"
                type="text"
                value={l.username}
                onChange={(e) => l.setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                className={fieldClasses('md')}
                placeholder={t('Enter your username')}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className={LABEL}>{t('Password')}</label>
              <div className="relative">
                <input
                  id="password"
                  type={l.showPassword ? 'text' : 'password'}
                  value={l.password}
                  onChange={(e) => l.setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className={clsx(fieldClasses('md'), 'pe-11')}
                  placeholder={t('Enter your password')}
                />
                <button
                  type="button"
                  onClick={l.toggleShowPassword}
                  aria-pressed={l.showPassword}
                  aria-label={l.showPassword ? t('Hide password') : t('Show password')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded text-fg-dim hover:text-fg transition-colors"
                >
                  {l.showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button type="submit" variant="primary" disabled={l.isLoading} className="w-full">
              {l.isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('Authenticating...')}
                </>
              ) : (
                t('Sign In')
              )}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-fg-faint">
          {t('zm-web • powered by zm_api')}
          {' · '}
          <span className="font-mono tabular-nums">v{appVersion}</span>
        </p>
      </div>
    </div>
  );
}
