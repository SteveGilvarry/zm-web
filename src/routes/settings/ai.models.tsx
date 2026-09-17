import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/ai/models')({
  component: () => <SkinPage page="settings.ai" section="models" />,
});
