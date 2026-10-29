import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useZmConfig } from '@/features/config/useZmConfig';
import { renderQrSvg, zmNgPortalUrl, zmNgProfileName, zmNgQrPayload } from './zmNgProfile';

/**
 * Legacy `user.php`'s "zmNg Mobile App QR Code" fieldset: a QR the zmNinjaNg
 * app scans to add this server as a profile, with the user's name filled in.
 * Shown for a saved user whose API access is on, as legacy does
 * (`ZM_OPT_USE_API && APIEnabled`).
 *
 * Legacy also offers a field that types the password into the code. Not
 * here: the app asks for it on the phone.
 */
export function MobileAppQr({ username }: { username: string }) {
  const { t } = useTranslation();
  const webTitle = useZmConfig('ZM_WEB_TITLE', '');
  const homeUrl = useZmConfig('ZM_HOME_URL', '');
  const [svg, setSvg] = useState<string | null>(null);

  const payload = zmNgQrPayload({
    name: zmNgProfileName(webTitle, homeUrl),
    portalUrl: zmNgPortalUrl(window.location.origin),
    username,
  });

  useEffect(() => {
    let cancelled = false;
    renderQrSvg(payload).then(
      (out) => { if (!cancelled) setSvg(out); },
      () => { if (!cancelled) setSvg(null); },
    );
    return () => { cancelled = true; };
  }, [payload]);

  const scanHint = t('Scan this QR code with the zmNg app to add this profile');

  return (
    <fieldset className="rounded border border-border-subtle p-3" data-testid="zmng-qr">
      <legend className="px-1 text-xs font-medium text-fg-muted">{t('zmNg Mobile App QR Code')}</legend>
      <div className="flex flex-col items-center gap-3 text-center">
        {/* A QR needs dark modules on a light ground whatever the scheme. */}
        <div className="inline-block rounded bg-white p-3 shadow-sm">
          {svg ? (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
              alt={scanHint}
              width={200}
              height={200}
              className="block"
            />
          ) : (
            <div className="h-[200px] w-[200px]" aria-hidden="true" />
          )}
        </div>
        <p className="text-xs text-fg-dim">{scanHint}</p>
        <p className="text-xs text-fg-dim">{t('The app asks for the password when the profile is added.')}</p>
      </div>
    </fieldset>
  );
}
