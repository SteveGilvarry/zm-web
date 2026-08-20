import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/settings/ptz-controls')({
  component: () => <SkinPage page="settings.ptzControls" />,
});
