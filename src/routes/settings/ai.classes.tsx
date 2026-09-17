import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/ai/classes')({
  component: () => <SkinPage page="settings.ai" section="classes" />,
});
