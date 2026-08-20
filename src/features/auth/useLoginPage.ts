import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { login } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { safeRedirectTarget } from './redirect';

/**
 * Login form state. Once the auth store is populated, goes to
 * `?redirect=<path>` when that is a same-app path, else to the console.
 */
export function useLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: '/login' });
  const { setTokens, isAuthenticated } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goOn = () => {
    const target = safeRedirectTarget(redirect);
    if (target) void navigate({ href: target, replace: true });
    else void navigate({ to: '/', replace: true });
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

  return {
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
