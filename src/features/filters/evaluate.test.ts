import { describe, expect, it } from 'vitest';
import { evaluateFilter } from './evaluate';
import type { FilterQuery } from '@/api/filters';
import type { ZmEvent } from '@/types';

const e = (overrides: Partial<ZmEvent>): ZmEvent =>
  ({
    id: 1,
    monitor_id: 1,
    name: 'Event',
    cause: 'Motion',
    notes: '',
    archived: 0,
    frames: 100,
    alarm_frames: 0,
    tot_score: 0,
    avg_score: 0,
    max_score: 0,
    start_date_time: '2026-05-24T12:00:00Z',
    end_date_time: '2026-05-24T12:01:00Z',
    length: '60',
    width: 1920,
    height: 1080,
    orientation: 'Rotate0',
    ...overrides,
  } as unknown as ZmEvent);

const q = (rules: FilterQuery['rules']): FilterQuery => ({ rules });

describe('evaluateFilter — empty query', () => {
  it('returns all events when no rules', () => {
    const events = [e({ id: 1 }), e({ id: 2 })];
    expect(evaluateFilter(q([]), events)).toHaveLength(2);
  });
});

describe('evaluateFilter — operators', () => {
  const events = [
    e({ id: 1, monitor_id: 1, max_score: 50,  cause: 'Motion' }),
    e({ id: 2, monitor_id: 2, max_score: 80,  cause: 'Continuous' }),
    e({ id: 3, monitor_id: 1, max_score: 100, cause: 'Motion alert' }),
  ];

  it("supports = on monitor_id", () => {
    const out = evaluateFilter(
      q([{ field: 'monitor_id', operator: '=', value: '1', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1, 3]);
  });

  it('supports > on numeric fields', () => {
    const out = evaluateFilter(
      q([{ field: 'max_score', operator: '>', value: '60', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([2, 3]);
  });

  it("supports 'contains' on string fields", () => {
    const out = evaluateFilter(
      q([{ field: 'cause', operator: 'contains', value: 'motion', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1, 3]);
  });

  it("supports 'starts' and 'ends'", () => {
    const out = evaluateFilter(
      q([{ field: 'cause', operator: 'ends', value: 'alert', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([3]);
  });
});

describe('evaluateFilter — conjunctions', () => {
  const events = [
    e({ id: 1, monitor_id: 1, max_score: 50  }),
    e({ id: 2, monitor_id: 1, max_score: 100 }),
    e({ id: 3, monitor_id: 2, max_score: 100 }),
  ];

  it('AND requires both rules', () => {
    const out = evaluateFilter(q([
      { field: 'monitor_id', operator: '=', value: '1', conjunction: 'and' },
      { field: 'max_score',  operator: '>', value: '60', conjunction: 'and' },
    ]), events);
    expect(out.map((x) => x.id)).toEqual([2]);
  });

  it('OR widens the match', () => {
    const out = evaluateFilter(q([
      { field: 'monitor_id', operator: '=', value: '1', conjunction: 'and' },
      { field: 'max_score',  operator: '>', value: '60', conjunction: 'or'  },
    ]), events);
    // monitor_id=1 OR max_score>60: events 1, 2, 3 all qualify.
    expect(out.map((x) => x.id)).toEqual([1, 2, 3]);
  });
});

describe('evaluateFilter — booleans (archived 0/1)', () => {
  const events = [e({ id: 1, archived: 0 }), e({ id: 2, archived: 1 })];

  it("matches '1' to numeric 1", () => {
    const out = evaluateFilter(
      q([{ field: 'archived', operator: '=', value: '1', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([2]);
  });

  it("matches '0' to numeric 0", () => {
    const out = evaluateFilter(
      q([{ field: 'archived', operator: '=', value: '0', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1]);
  });
});

describe('evaluateFilter — legacy operators (P19)', () => {
  const events = [
    e({ id: 1, monitor_id: 1, max_score: 50,  cause: 'Motion',       notes: '' }),
    e({ id: 2, monitor_id: 2, max_score: 80,  cause: 'Continuous',   notes: 'manual' }),
    e({ id: 3, monitor_id: 3, max_score: 100, cause: 'Motion alert', notes: 'note 3' }),
  ];

  it("supports '>=' (numeric, inclusive)", () => {
    const out = evaluateFilter(
      q([{ field: 'max_score', operator: '>=', value: '80', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([2, 3]);
  });

  it("supports '<=' (numeric, inclusive)", () => {
    const out = evaluateFilter(
      q([{ field: 'max_score', operator: '<=', value: '50', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1]);
  });

  it("supports '=~' (regex match, case-insensitive)", () => {
    const out = evaluateFilter(
      q([{ field: 'cause', operator: '=~', value: '^motion', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1, 3]);
  });

  it("supports '!~' (regex non-match)", () => {
    const out = evaluateFilter(
      q([{ field: 'cause', operator: '!~', value: 'continuous', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1, 3]);
  });

  it("supports '=[]' (IN — comma-separated)", () => {
    const out = evaluateFilter(
      q([{ field: 'monitor_id', operator: '=[]', value: '1, 3', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1, 3]);
  });

  it("supports '![]' (NOT IN — comma-separated)", () => {
    const out = evaluateFilter(
      q([{ field: 'monitor_id', operator: '![]', value: '2', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1, 3]);
  });

  it("'IS NULL' matches empty / missing values", () => {
    const out = evaluateFilter(
      q([{ field: 'notes', operator: 'IS', value: 'NULL', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1]);
  });

  it("'IS NOT NULL' matches non-empty values", () => {
    const out = evaluateFilter(
      q([{ field: 'notes', operator: 'IS NOT', value: 'NULL', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([2, 3]);
  });

  it("'LIKE' supports SQL-style % wildcards", () => {
    const out = evaluateFilter(
      q([{ field: 'cause', operator: 'LIKE', value: 'Motion%', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1, 3]);
  });

  it("'NOT LIKE' inverts LIKE", () => {
    const out = evaluateFilter(
      q([{ field: 'cause', operator: 'NOT LIKE', value: '%alert%', conjunction: 'and' }]),
      events,
    );
    expect(out.map((x) => x.id)).toEqual([1, 2]);
  });

  it("malformed regex on '=~' yields zero matches without throwing", () => {
    const out = evaluateFilter(
      q([{ field: 'cause', operator: '=~', value: '(unclosed', conjunction: 'and' }]),
      events,
    );
    expect(out).toEqual([]);
  });
});

describe('evaluateFilter — bracket grouping (P19)', () => {
  const events = [
    e({ id: 1, monitor_id: 1, max_score: 100, archived: 0 }),
    e({ id: 2, monitor_id: 2, max_score: 100, archived: 0 }),
    e({ id: 3, monitor_id: 2, max_score: 10,  archived: 1 }),
    e({ id: 4, monitor_id: 3, max_score: 10,  archived: 0 }),
  ];

  it('honours `(a OR b) AND c` precedence', () => {
    // (monitor_id=1 OR monitor_id=2) AND archived=0
    // → events 1, 2  (event 3 fails archived=0)
    const out = evaluateFilter(q([
      { field: 'monitor_id', operator: '=', value: '1', conjunction: 'and', bracket_open: 1, bracket_close: 0 },
      { field: 'monitor_id', operator: '=', value: '2', conjunction: 'or',  bracket_open: 0, bracket_close: 1 },
      { field: 'archived',   operator: '=', value: '0', conjunction: 'and', bracket_open: 0, bracket_close: 0 },
    ]), events);
    expect(out.map((x) => x.id)).toEqual([1, 2]);
  });

  it('with explicit brackets, evaluates AND/OR per SQL precedence', () => {
    // monitor_id=1 OR (monitor_id=2 AND archived=0)
    // → events 1, 2 (event 3 fails archived=0; event 4 fails both clauses)
    const out = evaluateFilter(q([
      { field: 'monitor_id', operator: '=', value: '1', conjunction: 'and', bracket_open: 0, bracket_close: 0 },
      { field: 'monitor_id', operator: '=', value: '2', conjunction: 'or',  bracket_open: 1, bracket_close: 0 },
      { field: 'archived',   operator: '=', value: '0', conjunction: 'and', bracket_open: 0, bracket_close: 1 },
    ]), events);
    expect(out.map((x) => x.id)).toEqual([1, 2]);
  });

  it('without any brackets, reduces left-to-right (legacy semantics)', () => {
    // ((monitor_id=1) OR monitor_id=2) AND archived=0
    // → events 1, 2 (event 3 fails archived=0)
    const out = evaluateFilter(q([
      { field: 'monitor_id', operator: '=', value: '1', conjunction: 'and' },
      { field: 'monitor_id', operator: '=', value: '2', conjunction: 'or' },
      { field: 'archived',   operator: '=', value: '0', conjunction: 'and' },
    ]), events);
    expect(out.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe('evaluateFilter — sort + limit', () => {
  const events = [
    e({ id: 1, max_score: 10 }),
    e({ id: 2, max_score: 90 }),
    e({ id: 3, max_score: 50 }),
  ];

  it('sorts asc/desc by numeric field', () => {
    const out = evaluateFilter(
      { rules: [], sort: { field: 'max_score', dir: 'desc' } },
      events,
    );
    expect(out.map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it('applies a numeric limit after sort', () => {
    const out = evaluateFilter(
      { rules: [], sort: { field: 'max_score', dir: 'desc' }, limit: 2 },
      events,
    );
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe(2);
  });
});
