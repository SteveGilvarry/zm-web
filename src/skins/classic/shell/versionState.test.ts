import { describe, expect, it } from 'vitest';
import { reminderWrite } from './versionState';

describe('reminderWrite — includes/actions/version.php', () => {
  const now = 1_000_000;
  it('ignores by recording the newest release as current', () => {
    expect(reminderWrite('ignore', '1.39.42', now)).toEqual({ name: 'ZM_DYN_CURR_VERSION', value: '1.39.42' });
  });
  it('pushes the next reminder out by an hour, a day, a week or 30 days', () => {
    expect(reminderWrite('hour', '', now).value).toBe(String(now + 3600));
    expect(reminderWrite('day', '', now).value).toBe(String(now + 86400));
    expect(reminderWrite('week', '', now).value).toBe(String(now + 604800));
    expect(reminderWrite('month', '', now)).toEqual({ name: 'ZM_DYN_NEXT_REMINDER', value: String(now + 2592000) });
  });
  it('turns update checks off for never', () => {
    expect(reminderWrite('never', '', now)).toEqual({ name: 'ZM_CHECK_FOR_UPDATES', value: '0' });
  });
});
