import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { PrivacyStatementText } from '@/features/privacy/PrivacyStatementText';
import { usePrivacyStatement } from '@/features/privacy/usePrivacyStatement';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import type { PagePropsMap } from '@/skins/types';
import { ClassicButton, classicInput, classicLink } from '../components/settings/primitives';

/**
 * `privacy.php`, classic skin: "ZoneMinder - Privacy", the statement, and
 * an Accept / Decline select (starting on the current telemetry setting)
 * with Apply. As the gate it covers the page the operator opened, the way
 * legacy's redirect replaces it; from the Options rail it is a page.
 */
export default function ClassicPrivacyPage({ variant }: PagePropsMap['settings.privacy']) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const p = usePrivacyStatement({
    // Legacy redirects to the home view after an answer.
    onAnswered: variant === 'page' ? () => void navigate({ to: '/' }) : undefined,
  });
  const [choice, setChoice] = useState<string | null>(null);
  const option = choice ?? (p.telemetry ? '1' : '0');
  useSiteTitle(t('Privacy'));

  const body = (
    <div className="max-w-5xl mx-auto px-4 pt-3 pb-4 text-sm text-zinc-800 bg-white">
      <h1 className="text-2xl font-semibold text-zinc-800 mb-3">ZoneMinder - {t('Privacy')}</h1>
      <form
        className="space-y-3 [&_p]:leading-relaxed"
        onSubmit={(e) => {
          e.preventDefault();
          p.answer(option === '1');
        }}
      >
        <PrivacyStatementText
          headingClassName="text-base font-semibold mt-4"
          linkClassName={classicLink}
          listClassName="list-disc ps-8 space-y-0.5"
        />
        <div className="flex items-center gap-2 pb-3">
          <select
            aria-label={t('Privacy')}
            value={option}
            onChange={(e) => setChoice(e.target.value)}
            className={classicInput}
          >
            <option value="1">{t('Accept')}</option>
            <option value="0">{t('Decline')}</option>
          </select>
          <ClassicButton type="submit" disabled={p.isSaving || !p.canAnswer}>{t('Apply')}</ClassicButton>
        </div>
      </form>
    </div>
  );

  if (variant === 'gate') {
    return (
      <div role="dialog" aria-modal="true" aria-label={t('Privacy')} className="fixed inset-0 z-50 overflow-auto bg-white">
        {body}
      </div>
    );
  }
  return <Page>{body}</Page>;
}

function Page({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <AppShell title={t('Privacy')}>
      <main className="flex-1 overflow-auto bg-white">
        {/* `privacy.php` sends anyone without System Edit to the error view. */}
        <RequirePerm feature="system" level="Edit" fallback="message">{children}</RequirePerm>
      </main>
    </AppShell>
  );
}
