import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/api-tokens')({
  component: () => <SkinPage page="settings.apiTokens" />,
});
