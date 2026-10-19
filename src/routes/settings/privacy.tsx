import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

/** Options → Privacy: legacy's tab redirects to `?view=privacy`. */
export const Route = createFileRoute('/settings/privacy')({
  component: () => <SkinPage page="settings.privacy" variant="page" />,
});
