import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/storage')({
  component: () => <SkinPage page="settings.storage" />,
});
