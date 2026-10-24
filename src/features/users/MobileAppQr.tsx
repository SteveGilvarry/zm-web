import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';

import { TextField } from '@/components/common/TextField';
import { useZmConfig } from '@/features/config/useZmConfig';
import { renderQrSvg, zmNgPortalUrl, zmNgProfileName, zmNgQrPayload } from './zmNgProfile';

/**
 * Legacy `user.php`'s "zmNg Mobile App QR Code" fieldset: a QR the zmNinjaNg
 * app scans to add this server as a profile, with the user's name filled in
 * and, if the operator types it here, the password. Shown for a saved user
 * whose API access is on, as legacy does (`ZM_OPT_USE_API && APIEnabled`).
 *
 * The password never leaves the page: it is typed into the QR text only, and
 * the field is empty every time the editor opens.
 */
export function MobileAppQr({ username }: { username: string }) {
  const { t } = useTranslation();
  const webTitle = useZmConfig('ZM_WEB_TITLE', '');
  const homeUrl = useZmConfig('ZM_HOME_URL', '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);

  const payload = zmNgQrPayload({
    name: zmNgProfileName(webTitle, homeUrl),
    portalUrl: zmNgPortalUrl(window.location.origin),
    username,
    password,
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
        <div className="flex w-full max-w-xs items-end gap-2">
          <TextField
            label={t('Password')}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('Optional')}
            autoComplete="off"
            hint={t('Enter password to include it in the QR code')}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t('Hide password') : t('Show password')}
            aria-pressed={showPassword}
            className="mb-6 rounded border border-border-subtle p-2 text-fg-muted hover:text-fg"
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
    </fieldset>
  );
}
