import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/reports/')({
  component: () => <SkinPage page="reports.list" />,
});
