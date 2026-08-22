import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export interface UsersSearch {
  /** Opens that user's editor on load (legacy `?view=user&uid=`; `0` means new). */
  uid?: number;
}

export const Route = createFileRoute('/settings/users')({
  component: () => <SkinPage page="settings.users" />,
  validateSearch: (search: Record<string, unknown>): UsersSearch => {
    const raw = search.uid;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isInteger(n) && n >= 0 ? { uid: n } : {};
  },
});
