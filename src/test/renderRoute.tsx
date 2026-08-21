import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
  type AnyRouter,
} from '@tanstack/react-router';
import { render, type RenderResult } from '@testing-library/react';

import { routeTree } from '@/routeTree.gen';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import type { SkinId } from '@/skins/types';
import type { UserClaims, UserPerms } from '@/types';

/**
 * Render a URL through the **real** router.
 *
 * `renderWithProviders` mounts a page component directly, which means the
 * route module, `SkinPage`, the skin chrome, `beforeLoad` guards and
 * `validateSearch` never run — exactly the layers that break when a route
 * file is renamed or a search param changes shape. `renderRoute('/events?…')`
 * exercises all of them: memory history in, rendered app out.
 *
 *   const { router } = renderRoute('/monitors/2?edit=true');
 *   expect(await screen.findByRole('heading', { name: /driveway/i })).toBeVisible();
 *   expect(router.state.location.pathname).toBe('/monitors/2');
 *
 * Pages are lazy (one chunk per skin per page), so always assert with
 * `findBy*` / `waitFor` — the first paint is the Suspense fallback.
 */

/**
 * jsdom ships no `matchMedia`, and the modern Sidebar / Watch page read it
 * through `useSyncExternalStore` on first render — without this the whole
 * tree throws before a single assertion runs. Desktop by default so the
 * sidebar renders inline rather than as an off-canvas drawer.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: /min-width:\s*1024px/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

const ALL_EDIT: UserPerms = {
  stream: 'Edit',
  events: 'Edit',
  control: 'Edit',
  monitors: 'Edit',
  groups: 'Edit',
  devices: 'Edit',
  snapshots: 'Edit',
  system: 'Edit',
};

export interface RenderRouteOptions {
  /** Which skin renders the page. Defaults to `modern`. */
  skin?: SkinId;
  /**
   * Permission levels in the token's `perms` claim. Defaults to `Edit` on
   * everything; pass a partial to restrict (`{ system: 'None' }`), or `null`
   * to model a pre-RBAC token that carries no claim at all.
   */
  perms?: Partial<UserPerms> | null;
  /** Sign the user out — use it to test the root route's login bounce. */
  authenticated?: boolean;
  /** Extra claims merged into the seeded token. */
  claims?: Partial<UserClaims>;
  queryClient?: QueryClient;
}

export interface RenderRouteResult extends RenderResult {
  router: AnyRouter;
  queryClient: QueryClient;
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** An unsigned but structurally real JWT, so `parseJwt` reads the claims back. */
export function makeTestToken(claims: UserClaims): string {
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(claims)}.sig`;
}

/** The claim set a signed-in operator carries, with `perms` per the options. */
export function makeTestClaims(
  options: Pick<RenderRouteOptions, 'perms' | 'claims'> = {},
): UserClaims {
  const { perms = ALL_EDIT, claims = {} } = options;
  const base: UserClaims = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    user: 'admin',
    uid: 1,
    typ: 'access',
    ...claims,
  };
  // `perms: null` models a token from a pre-RBAC backend: no claim at all,
  // which `effectivePerms()` reads as "everything is Edit, the backend gates".
  return perms === null ? base : { ...base, perms: { ...ALL_EDIT, ...perms } };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Seed the auth store without going through `setTokens` (which arms a refresh timer). */
export function seedAuth(options: Pick<RenderRouteOptions, 'perms' | 'authenticated' | 'claims'> = {}) {
  const { authenticated = true, perms, claims } = options;
  if (!authenticated) {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      sessionExpired: false,
    });
    return null;
  }
  const full = makeTestClaims({ perms, claims });
  useAuthStore.setState({
    accessToken: makeTestToken(full),
    refreshToken: 'test.refresh.token',
    user: full,
    isAuthenticated: true,
    sessionExpired: false,
  });
  return full;
}

export function renderRoute(path: string, options: RenderRouteOptions = {}): RenderRouteResult {
  const { skin = 'modern', queryClient = makeQueryClient() } = options;

  seedAuth(options);
  useUiStore.setState({ skin, sidebarCollapsed: false });

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMs: 0,
  }) as AnyRouter;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return Object.assign(result, { router, queryClient });
}
