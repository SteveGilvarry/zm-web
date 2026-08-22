import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/')({
  component: () => <SkinPage page="settings.options" />,
});
