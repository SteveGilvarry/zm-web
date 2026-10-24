import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw/http';
import { setupMockServer, server } from '@/test/msw/server';
import {
  exclusivePick, pickTags, resolveTagRule, tagPickFromOption, tagPicksToApi, tagPicksToTermValue,
} from './tagFilter';
import { parseEventsSearch, tagsFromSearch, tagsToSearch } from './eventsSearch';

setupMockServer();

describe('pickTags', () => {
  it('keeps a newly picked sentinel on its own', () => {
    expect(pickTags([3, 5], [3, 5, 'none'])).toEqual(['none']);
    expect(pickTags(['none'], ['none', 'any'])).toEqual(['any']);
  });

  it('drops the sentinel when a tag is picked after it', () => {
    expect(pickTags(['any'], ['any', 7])).toEqual([7]);
  });

  it('leaves removals and plain tag picks alone', () => {
    expect(pickTags([3, 5], [5])).toEqual([5]);
    expect(pickTags([3], [3, 5])).toEqual([3, 5]);
    expect(pickTags(['none'], [])).toEqual([]);
  });

  it('works on any value type', () => {
    expect(exclusivePick(['3'], ['3', '0'], ['0', '-1'])).toEqual(['0']);
  });
});

describe('tag pick encodings', () => {
  it('reads option values', () => {
    expect(tagPickFromOption('none')).toBe('none');
    expect(tagPickFromOption('any')).toBe('any');
    expect(tagPickFromOption('12')).toBe(12);
    expect(tagPickFromOption('x')).toBeUndefined();
    expect(tagPickFromOption('0')).toBeUndefined();
  });

  it('writes the API and the ZoneMinder term spellings', () => {
    expect(tagPicksToApi([])).toBeUndefined();
    expect(tagPicksToApi([3, 5])).toBe('3,5');
    expect(tagPicksToApi(['none'])).toBe('none');
    expect(tagPicksToTermValue(['none'])).toBe('0');
    expect(tagPicksToTermValue(['any'])).toBe('-1');
    expect(tagPicksToTermValue([3, 5])).toBe('3,5');
  });

  it('round-trips through the URL, old single-tag links included', () => {
    expect(tagsFromSearch({ tag: 4 })).toEqual([4]);
    expect(tagsFromSearch({ tag: '4,any' })).toEqual([4, 'any']);
    expect(tagsFromSearch({ tag: [4, 'none', 'junk'] })).toEqual([4, 'none']);
    // Legacy's own sentinels are understood too.
    expect(tagsFromSearch({ tag: '0' })).toEqual(['none']);
    expect(tagsFromSearch({ tag: '-1' })).toEqual(['any']);
    expect(tagsToSearch([4])).toBe(4);
    expect(tagsToSearch([4, 5])).toEqual([4, 5]);
    expect(tagsToSearch([])).toBeUndefined();
    expect(parseEventsSearch({ tag: 'none' })).toEqual({ tag: 'none' });
    expect(parseEventsSearch({ tag: [1, 2] })).toEqual({ tag: [1, 2] });
  });
});

describe('resolveTagRule', () => {
  function recordTagLookups(ids: number[]) {
    const asked: string[] = [];
    server.use(http.get('/api/v3/events', ({ request }) => {
      asked.push(new URL(request.url).searchParams.get('tag_id') ?? '');
      return HttpResponse.json({
        items: ids.map((id) => ({ id })), total: ids.length, per_page: 1000, current_page: 1, last_page: 1,
      });
    }));
    return asked;
  }

  it('is nothing to filter on with no picks', async () => {
    expect(await resolveTagRule([])).toBeNull();
  });

  it('keeps the events carrying the picked tags', async () => {
    const asked = recordTagLookups([4, 9]);
    expect(await resolveTagRule([3, 5])).toEqual({ field: 'id', op: 'in', value: [4, 9] });
    expect(asked).toEqual(['3,5']);
  });

  it('reads Any Tag and No Tag off the tagged events', async () => {
    const asked = recordTagLookups([4]);
    expect(await resolveTagRule(['any'])).toEqual({ field: 'id', op: 'in', value: [4] });
    expect(await resolveTagRule(['none'])).toEqual({ field: 'id', op: 'not_in', value: [4] });
    expect(asked).toEqual(['any', 'any']);
  });

  it('turns the condition round for a != term', async () => {
    recordTagLookups([4]);
    expect(await resolveTagRule([3], true)).toEqual({ field: 'id', op: 'not_in', value: [4] });
    expect(await resolveTagRule(['none'], true)).toEqual({ field: 'id', op: 'in', value: [4] });
  });

  it('treats No Tag with Any Tag as everything', async () => {
    expect(await resolveTagRule(['none', 'any'])).toBeNull();
    expect(await resolveTagRule(['none', 'any'], true)).toEqual({ field: 'id', op: 'in', value: [] });
  });
});
