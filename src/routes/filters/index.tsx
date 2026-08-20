import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export interface FiltersSearchParams {
  /** Saved filter to open (legacy `?view=filter&Id=`). */
  id?: number;
  /** JSON-encoded ZoneMinder `terms` array to seed a new filter with (the
   *  Events list's "Filter" button). */
  terms?: string;
}

export const Route = createFileRoute('/filters/')({
  component: () => <SkinPage page="filters" />,
  validateSearch: (search: Record<string, unknown>): FiltersSearchParams => {
    const id = typeof search.id === 'number' ? search.id
      : typeof search.id === 'string' && search.id !== '' ? Number(search.id)
      : undefined;
    return {
      id: id != null && Number.isInteger(id) && id > 0 ? id : undefined,
      terms: typeof search.terms === 'string' && search.terms !== '' ? search.terms : undefined,
    };
  },
});
