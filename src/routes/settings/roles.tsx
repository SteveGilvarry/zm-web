import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/roles')({
  component: () => <SkinPage page="settings.roles" />,
});
