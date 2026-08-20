import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/montage/')({
  component: () => <SkinPage page="montage" />,
});
