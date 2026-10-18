import { describe, expect, it } from 'vitest';
import { runStateName } from './useRunState';

describe('runStateName — legacy runtimeStatus()', () => {
  const states = [{ name: 'default', is_active: 0 }, { name: 'Away', is_active: 1 }];

  it('names the active saved state while running', () => {
    expect(runStateName(true, states)).toBe('Away');
  });
  it('gives no name for the default state, so the button reads Running', () => {
    expect(runStateName(true, [{ name: 'default', is_active: 1 }])).toBeNull();
  });
  it('gives no name while stopped or unknown, whatever is active', () => {
    expect(runStateName(false, states)).toBeNull();
    expect(runStateName(null, states)).toBeNull();
  });
  it('gives no name when no state is active or the list has not loaded', () => {
    expect(runStateName(true, [{ name: 'Away', is_active: 0 }])).toBeNull();
    expect(runStateName(true, undefined)).toBeNull();
  });
});
