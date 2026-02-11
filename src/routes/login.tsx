import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Shield, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { login } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { setTokens, isAuthenticated } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: '/' });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await login({ username, password });
      setTokens(response.access_token, response.refresh_token);
      navigate({ to: '/' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(0,212,255,0.05) 0%, transparent 50%)',
          }}
        />
      </div>

      {/* Login card */}
      <div className="relative w-full max-w-md">
        {/* Glow effect */}
        <div className="absolute -inset-px bg-gradient-to-r from-cyan/20 via-cyan/10 to-cyan/20 rounded-2xl blur-xl" />

        <div className="relative bg-surface rounded-2xl border border-border-subtle shadow-elevated p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-cyan/10 flex items-center justify-center mb-4 shadow-glow-cyan">
              <Shield className="text-cyan" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-text-primary">
              ZM<span className="text-cyan">dash</span>
            </h1>
            <p className="text-sm text-text-muted mt-1">
              ZoneMinder Surveillance Dashboard
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-crimson/10 border border-crimson/30 flex items-center gap-2">
              <AlertCircle size={16} className="text-crimson flex-shrink-0" />
              <span className="text-sm text-crimson">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                className={clsx(
                  'w-full px-4 py-3 rounded-lg',
                  'bg-panel border border-border-subtle',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:outline-none focus:border-cyan/50 focus:ring-2 focus:ring-cyan/20',
                  'transition-all duration-fast'
                )}
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className={clsx(
                    'w-full px-4 py-3 pr-12 rounded-lg',
                    'bg-panel border border-border-subtle',
                    'text-text-primary placeholder:text-text-muted',
                    'focus:outline-none focus:border-cyan/50 focus:ring-2 focus:ring-cyan/20',
                    'transition-all duration-fast'
                  )}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={clsx(
                'w-full py-3 rounded-lg font-medium',
                'bg-cyan text-void',
                'hover:bg-cyan-dim',
                'focus:outline-none focus:ring-2 focus:ring-cyan/50 focus:ring-offset-2 focus:ring-offset-surface',
                'transition-all duration-fast',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-border-subtle text-center">
            <p className="text-xs text-text-dim">
              Secure connection • Powered by zm_api
            </p>
          </div>
        </div>

        {/* Version */}
        <div className="mt-4 text-center">
          <span className="text-xs font-mono text-text-dim">v1.0.0</span>
        </div>
      </div>
    </div>
  );
}
