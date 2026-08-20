import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/users')({
  component: () => <SkinPage page="settings.users" />,
});
