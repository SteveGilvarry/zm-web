import { useTranslation } from 'react-i18next';
import { CircleUserRound, Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';
import { useLoginPage } from '@/features/auth/useLoginPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { version as appVersion } from '../../../../package.json';

/**
 * Login — classic skin. The legacy `?view=login` page: dark navbar with the
 * brand, a centred white form with the account icon heading, Username,
 * Password and a full-width blue button. No shell, no neon.
 */
export default function ClassicLoginPage() {
  const { t } = useTranslation();
  const l = useLoginPage();
  const { title } = useSiteTitle(t('Login'));

  return (
    <div className="min-h-screen bg-white text-zinc-800 flex flex-col">
      <header className="bg-[#3c4956] text-white border-b border-black/40">
        <div className="px-4 py-2 flex items-center justify-between">
          <span className="text-2xl font-semibold tracking-tight text-amber-400">{title}</span>
          <span className="text-xs text-zinc-300 font-mono">v{appVersion}</span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pt-16">
        <form onSubmit={l.handleSubmit} className="w-full max-w-sm" noValidate>
          {l.notice && (
            <div role="status" className="mb-4 px-3 py-2 rounded-sm border border-amber-400 bg-amber-50 text-sm text-amber-900">
              {l.notice}
            </div>
          )}
          {l.error && (
            <div role="alert" className="mb-4 px-3 py-2 rounded-sm border border-[#ebccd1] bg-[#f2dede] text-sm text-[#a94442]">
              {l.error}
            </div>
          )}

          <div className="space-y-3">
            <h1 className="flex items-center justify-center gap-2 text-2xl font-normal text-zinc-800 mb-4">
              <CircleUserRound size={34} aria-hidden />
              {t('{{title}} Login', { title })}
            </h1>

            <label htmlFor="username" className="sr-only">{t('Username')}</label>
            <input
              id="username"
              type="text"
              value={l.username}
              onChange={(e) => l.setUsername(e.target.value)}
              required
              autoFocus
              autoCapitalize="none"
              autoComplete="username"
              placeholder={t('Username')}
              className={clsx(
                'block w-full px-3 py-2 text-base bg-white border border-zinc-400 rounded-sm text-zinc-900',
                'placeholder:text-zinc-500 focus:outline-none focus:border-[#66afe9] focus:ring-2 focus:ring-[#66afe9]/40',
              )}
            />

            <label htmlFor="password" className="sr-only">{t('Password')}</label>
            <div className="relative">
              <input
                id="password"
                type={l.showPassword ? 'text' : 'password'}
                value={l.password}
                onChange={(e) => l.setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder={t('Password')}
                className={clsx(
                  'block w-full px-3 py-2 pe-10 text-base bg-white border border-zinc-400 rounded-sm text-zinc-900',
                  'placeholder:text-zinc-500 focus:outline-none focus:border-[#66afe9] focus:ring-2 focus:ring-[#66afe9]/40',
                )}
              />
              <button
                type="button"
                onClick={l.toggleShowPassword}
                aria-label={l.showPassword ? t('Hide password') : t('Show password')}
                className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-800"
              >
                {l.showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={l.isLoading}
              className={clsx(
                'block w-full px-4 py-2.5 text-lg rounded-sm border',
                'bg-[#337ab7] border-[#2e6da4] text-white hover:bg-[#286090]',
                'disabled:opacity-60 disabled:cursor-not-allowed',
              )}
            >
              {l.isLoading ? t('Authenticating...') : t('Login')}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
