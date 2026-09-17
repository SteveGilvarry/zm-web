/**
 * The value cells that have to fetch their options: tags, groups, zones,
 * run states and servers. Each one mounts only while a term of that kind is
 * on screen, which is what keeps a plain `Cause LIKE motion` filter from
 * firing five lookup requests.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { RuleBuilder } from './RuleBuilder';
import type { FilterQuery, FilterTerm } from '@/api/filters';
import type { Monitor, ZmStorage } from '@/types';

const page = <T,>(items: T[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });

let hits: string[] = [];
const count = (path: string) => { hits.push(path); };

const server = setupServer(
  http.get('/api/v3/tags', () => { count('tags'); return page([{ id: 2, name: 'person' }, { id: 1, name: 'Car' }]); }),
  http.get('/api/v3/groups', () => { count('groups'); return page([{ id: 7, name: 'Outside' }]); }),
  http.get('/api/v3/states', () => { count('states'); return page([{ id: 3, name: 'Away', definition: '', is_active: 0 }]); }),
  http.get('/api/v3/servers', () => { count('servers'); return page([{ id: 4, name: 'zm-node-2', status: 'Running' }]); }),
  http.get('/api/v3/monitors/:id/zones', ({ params }) => {
    count(`zones/${params.id}`);
    return page(params.id === '1'
      ? [{ id: 11, monitor_id: 1, name: 'Porch', type: 'Active', units: 'Pixels', coords: '', num_coords: 0, area: 0, check_method: 'Blobs', overload_frames: 0, extend_alarm_frames: 0 }]
      : [{ id: 22, monitor_id: 2, name: 'Kerb', type: 'Active', units: 'Pixels', coords: '', num_coords: 0, area: 0, check_method: 'Blobs', overload_frames: 0, extend_alarm_frames: 0 }]);
  }),
);

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { user: 'admin', iat: 0, exp: 0 } as never, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { hits = []; server.resetHandlers(); });
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const monitors: Monitor[] = [
  { id: 2, name: 'Driveway' } as unknown as Monitor,
  { id: 1, name: 'Front Door' } as unknown as Monitor,
];
const storage: ZmStorage[] = [
  { id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 },
];

function mount(terms: FilterTerm[]) {
  const onChange = vi.fn();
  const query: FilterQuery = { terms };
  renderWithProviders(
    <RuleBuilder query={query} monitors={monitors} storage={storage} onChange={onChange} />,
  );
  return onChange;
}

const firstTerm = (onChange: ReturnType<typeof vi.fn>): FilterTerm =>
  (onChange.mock.calls[0][0] as FilterQuery).terms[0];

const options = (sel: HTMLElement) =>
  Array.from(sel.querySelectorAll('option')).map((o) => [o.value, o.textContent]);

describe('RuleBuilder — lookup-backed value cells', () => {
  it('Tags is a multi-select of No Tag / Any Tag then the tags by name', async () => {
    mount([{ attr: 'Tags', op: '=', val: '' }]);
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    expect(sel.multiple).toBe(true);
    await waitFor(() => expect(sel.options).toHaveLength(4));
    expect(options(sel)).toEqual([
      ['0', 'No Tag'], ['-1', 'Any Tag'], ['1', 'Car'], ['2', 'person'],
    ]);
  });

  it('Tags writes the selection back as a comma list and reads one back', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'Tags', op: '=', val: '1,2' }]);
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    await waitFor(() => expect(sel.options).toHaveLength(4));
    expect(Array.from(sel.selectedOptions).map((o) => o.value)).toEqual(['1', '2']);
    await user.deselectOptions(sel, '1');
    expect(firstTerm(onChange)).toMatchObject({ attr: 'Tags', val: '2' });
  });

  it('Tags offers only = and != (legacy `Filter` never emits a range for it)', () => {
    mount([{ attr: 'Tags', op: '=', val: '' }]);
    const ops = Array.from(screen.getByLabelText('Operator').querySelectorAll('option')).map((o) => o.value);
    expect(ops).toEqual(['=', '!=']);
  });

  it('Group lists the monitor groups by id', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'Group', op: '=', val: '' }]);
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    await waitFor(() => expect(sel.options).toHaveLength(2));
    expect(options(sel)[1]).toEqual(['7', 'Outside']);
    await user.selectOptions(sel, '7');
    expect(firstTerm(onChange)).toMatchObject({ attr: 'Group', val: '7' });
  });

  it('AlarmedZoneId fans out over the monitors and labels "<monitor>: <zone>"', async () => {
    mount([{ attr: 'AlarmedZoneId', op: '=', val: '22' }]);
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    await waitFor(() => expect(sel.options).toHaveLength(3));
    // Monitors sorted by name, so Driveway's zone comes first.
    expect(options(sel)).toEqual([
      ['', '— select —'], ['22', 'Driveway: Kerb'], ['11', 'Front Door: Porch'],
    ]);
    expect(sel.value).toBe('22');
    expect(hits.sort()).toEqual(['zones/1', 'zones/2']);
  });

  it('StateId lists the run states', async () => {
    mount([{ attr: 'StateId', op: '=', val: '3' }]);
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    await waitFor(() => expect(sel.options).toHaveLength(2));
    expect(options(sel)[1]).toEqual(['3', 'Away']);
    expect(sel.value).toBe('3');
  });

  it('a *ServerId picker leads with Current Server / No Server', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'MonitorServerId', op: '=', val: 'ZM_SERVER_ID' }]);
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    await waitFor(() => expect(sel.options).toHaveLength(3));
    expect(options(sel)).toEqual([
      ['ZM_SERVER_ID', 'Current Server'], ['NULL', 'No Server'], ['4', 'zm-node-2'],
    ]);
    await user.selectOptions(sel, 'NULL');
    expect(firstTerm(onChange)).toMatchObject({ val: 'NULL' });
  });

  it('ExistsInFileSystem is false/true, not the generic IS NULL menu', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'ExistsInFileSystem', op: 'IS', val: 'false' }]);
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    expect(options(sel)).toEqual([['false', 'False'], ['true', 'True']]);
    const ops = Array.from(screen.getByLabelText('Operator').querySelectorAll('option')).map((o) => o.value);
    expect(ops).toEqual(['IS', 'IS NOT']);
    await user.selectOptions(sel, 'true');
    expect(firstTerm(onChange)).toMatchObject({ val: 'true' });
  });

  it('Monitor is a monitor-id picker, like MonitorId', () => {
    mount([{ attr: 'Monitor', op: '=', val: '1' }]);
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    expect(options(sel)).toEqual([['', '— select —'], ['2', 'Driveway'], ['1', 'Front Door']]);
    expect(sel.value).toBe('1');
  });

  it('a filter with none of those kinds fetches nothing', async () => {
    mount([{ attr: 'Cause', op: 'LIKE', val: 'motion' }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(hits).toEqual([]);
  });
});

describe('RuleBuilder — lookup failures degrade to an empty list', () => {
  it('keeps the sentinels when /tags is down', async () => {
    server.use(http.get('/api/v3/tags', () => HttpResponse.json({ error: 'nope' }, { status: 500 })));
    mount([{ attr: 'Tags', op: '=', val: '' }]);
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    await waitFor(() => expect(within(sel).getByText('Any Tag')).toBeInTheDocument());
    expect(sel.options).toHaveLength(2);
  });
});
