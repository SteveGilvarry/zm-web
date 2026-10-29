import { useEffect, useId, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Button } from '@/components/common/Button';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { PrivacyStatementText } from '@/features/privacy/PrivacyStatementText';
import { usePrivacyStatement } from '@/features/privacy/usePrivacyStatement';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import type { PagePropsMap } from '@/skins/types';

const TEXT = 'space-y-3 text-sm leading-relaxed text-fg-muted';
const HEADING = 'pt-2 text-xs font-medium text-fg';
const LINK = 'text-accent hover:underline';
const LIST = 'list-disc ps-5 space-y-0.5';

/**
 * The privacy statement, modern skin. As the gate it is a plain dialog
 * that only an answer closes (the question is asked once, so there is no
 * "later"); from Settings it is a page with the same two buttons.
 */
export default function SettingsPrivacyPage({ variant }: PagePropsMap['settings.privacy']) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const p = usePrivacyStatement({
    onAnswered: variant === 'page' ? () => void navigate({ to: '/' }) : undefined,
  });
  useSiteTitle(t('Privacy'));
  const titleId = useId();
  const acceptRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (variant === 'gate') acceptRef.current?.focus();
  }, [variant]);

  const actions = (
    <div className="flex items-center justify-end gap-3">
      <span className="me-auto text-xs text-fg-dim">
        {p.telemetry ? t('Telemetry is on now.') : t('Telemetry is off now.')}
      </span>
      <Button onClick={() => p.answer(false)} disabled={p.isSaving || !p.canAnswer}>{t('Decline')}</Button>
      <Button ref={acceptRef} variant="primary" onClick={() => p.answer(true)} disabled={p.isSaving || !p.canAnswer}>
        {p.isSaving && <Loader2 size={14} className="animate-spin" aria-hidden />}
        {t('Accept')}
      </Button>
    </div>
  );

  if (variant === 'gate') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="flex max-h-full w-full max-w-2xl flex-col rounded border border-border bg-surface shadow-lg"
        >
          <h2 id={titleId} className="border-b border-border-subtle px-5 py-3 text-sm font-medium text-fg">
            {t('Privacy')}
          </h2>
          <div className={`${TEXT} overflow-auto px-5 py-4`}>
            <PrivacyStatementText headingClassName={HEADING} linkClassName={LINK} listClassName={LIST} />
          </div>
          <div className="border-t border-border-subtle px-5 py-3">{actions}</div>
        </div>
      </div>
    );
  }

  return (
    <AppShell title={t('Privacy')}>
      <main className="flex-1 p-6 overflow-auto">
        <RequirePerm feature="system" level="Edit" fallback="message">
          <div className="mx-auto w-full max-w-3xl space-y-4">
            <h2 className="text-sm font-medium text-fg">{t('Privacy')}</h2>
            <div className={TEXT}>
              <PrivacyStatementText headingClassName={HEADING} linkClassName={LINK} listClassName={LIST} />
            </div>
            {actions}
          </div>
        </RequirePerm>
      </main>
    </AppShell>
  );
}
