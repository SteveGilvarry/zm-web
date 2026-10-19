import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/encoder-templates')({
  component: () => <SkinPage page="settings.encoderTemplates" />,
});
