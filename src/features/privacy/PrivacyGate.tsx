import { useLocation } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';
import { usePrivacyStatement } from './usePrivacyStatement';

/**
 * Mounted once at the root so every page, in either skin, asks the privacy
 * question while `ZM_SHOW_PRIVACY` is on. Like legacy's redirect
 * (`index.php:274`) it stays out of the way on Options, where the operator
 * may go to change telemetry first, and on the login page.
 */
export function PrivacyGate() {
  const { pathname } = useLocation();
  const { mustAnswer } = usePrivacyStatement();
  if (!mustAnswer || pathname === '/login' || pathname === '/settings' || pathname.startsWith('/settings/')) return null;
  return <SkinPage page="settings.privacy" variant="gate" />;
}
