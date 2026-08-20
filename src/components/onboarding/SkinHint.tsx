import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { Trans, useTranslation } from 'react-i18next';
import { X, Sparkles } from 'lucide-react';
import { useUiStore } from '@/stores/ui';

const ACK_KEY = 'zmdash:skinHintDismissed';

function readDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  return Boolean(window.localStorage.getItem(ACK_KEY));
}

/**
 * One-time hint banner shown on the Console after first login. Tells legacy
 * ZM operators where the Classic skin lives so they're not stranded in
 * Mission Control by default. Dismissal sticks in localStorage so we don't
 * pester users.
 *
 * Only shows when the user is on the modern skin — if they've already found
 * (or imported via URL hint) the classic skin, they don't need the nudge.
 */
export function SkinHint() {
  const { t } = useTranslation();
  const skin = useUiStore((s) => s.skin);
  // Read the ack flag once on mount; visibility is derived from it + skin.
  const [dismissed, setDismissed] = useState(readDismissed);

  const dismiss = () => {
    try {
      window.localStorage.setItem(ACK_KEY, String(Date.now()));
    } catch {
      // localStorage can throw in private-window contexts — fine, drop it.
    }
    setDismissed(true);
  };

  if (skin !== 'modern' || dismissed) return null;

  return (
    <div
      role="status"
      className={clsx(
        'fixed bottom-6 end-6 z-40 max-w-sm',
        'rounded-xl border border-cyan/40 bg-panel/95 backdrop-blur-md',
        'shadow-[0_0_30px_rgba(0,212,255,0.15)]',
        'p-4 animate-in fade-in slide-in-from-bottom-2 duration-300',
      )}
    >
      <div className="flex items-start gap-3">
        <Sparkles size={16} className="text-cyan flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            {t('Coming from the legacy UI?')}
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed">
            <Trans>
              Mission Control is the default modern view. If you'd rather the
              classic ZoneMinder layout, switch in{' '}
              <Link
                to="/settings"
                onClick={dismiss}
                className="text-cyan hover:text-cyan-dim underline-offset-2 hover:underline"
              >
                Settings → Appearance
              </Link>
              .
            </Trans>
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label={t('Dismiss')}
          className="flex-shrink-0 p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
