import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

/** `?group=` — legacy `?view=montage&group=` — pre-applies a group filter. */
interface MontageSearchParams {
  group?: number;
}

export const Route = createFileRoute('/montage/')({
  component: () => <SkinPage page="montage" />,
  validateSearch: (search: Record<string, unknown>): MontageSearchParams => ({
    group: toInt(search.group),
  }),
});

function toInt(v: unknown): number | undefined {
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n > 0 ? n : undefined;
}
