import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { login } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { safeRedirectTarget } from './redirect';
import { homeViewRoute } from './homeView';
import { useZmConfig } from '@/features/config/useZmConfig';

/** Why the user landed here, from `?reason=`; only `expired` has a message today. */
export type LoginReason = 'expired' | null;

export function parseLoginReason(raw: unknown): LoginReason {
  return raw === 'expired' ? 'expired' : null;
}

/**
 * Login form state. Once the auth store is populated, goes to
 * `?redirect=<path>` when that is a same-app path, else to whatever
 * `ZM_WEB_HOMEVIEW` names, else the console.
 * `?reason=expired` shows the session-expired notice (the auth store
 * clears tokens when refresh fails; whoever bounces to /login sets it).
 */
export function useLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: '/login' });
  const loose = useSearch({ strict: false }) as { reason?: unknown };
  const reason = parseLoginReason(loose.reason);
  const { setTokens, isAuthenticated } = useAuthStore();
  // `ZM_WEB_HOMEVIEW` — where this installation wants operators to land.
  // An explicit `?redirect=` always wins: it is the page they asked for.
  const homeView = useZmConfig('ZM_WEB_HOMEVIEW', '');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goOn = () => {
    const target = safeRedirectTarget(redirect);
    if (target) void navigate({ href: target, replace: true });
    else void navigate({ href: homeViewRoute(homeView), replace: true });
  };

  // Already signed in (back button, second tab): skip the form.
  useEffect(() => {
    if (isAuthenticated) goOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goOn reads stable router/search values
  }, [isAuthenticated]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await login({ username, password });
      setTokens(response.access_token, response.refresh_token);
      goOn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Login failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const notice = reason === 'expired' ? t('Your session has expired. Please sign in again.') : null;

  return {
    reason,
    notice,
    username,
    setUsername,
    password,
    setPassword,
    showPassword,
    toggleShowPassword: () => setShowPassword((v) => !v),
    isLoading,
    error,
    handleSubmit,
  };
}
