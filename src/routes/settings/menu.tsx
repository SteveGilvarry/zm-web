import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/menu')({
  component: () => <SkinPage page="settings.menu" />,
});
