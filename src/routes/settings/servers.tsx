import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/servers')({
  component: () => <SkinPage page="settings.servers" />,
});
