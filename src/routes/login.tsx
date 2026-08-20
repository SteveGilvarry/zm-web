import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export interface LoginSearch {
  /** In-app path to return to after signing in; validated in `useLoginPage`. */
  redirect?: string;
}

export const Route = createFileRoute('/login')({
  component: () => <SkinPage page="login" />,
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' && search.redirect ? search.redirect : undefined,
  }),
});
