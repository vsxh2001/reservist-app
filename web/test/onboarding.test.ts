import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { hasSeenOnboarding, markOnboardingSeen, resetOnboarding } from '../src/lib/onboarding';

// The flag is member-scoped (each profile sees the tour once) and versioned
// (a future tour expansion can re-trigger by bumping VERSION). localStorage is
// wrapped in try/catch so a throwing store never breaks the dashboard.

describe('onboarding seen-flag', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('defaults to not-seen for an unknown member', () => {
    expect(hasSeenOnboarding('m1')).toBe(false);
  });

  it('records and reads back per member', () => {
    markOnboardingSeen('m1');
    expect(hasSeenOnboarding('m1')).toBe(true);
    // Scoped: a different member is unaffected.
    expect(hasSeenOnboarding('m2')).toBe(false);
  });

  it('reset clears the flag so the tour shows again', () => {
    markOnboardingSeen('m1');
    resetOnboarding('m1');
    expect(hasSeenOnboarding('m1')).toBe(false);
  });

  it('treats an empty member id as not-seen and never writes for it', () => {
    expect(hasSeenOnboarding('')).toBe(false);
    markOnboardingSeen('');
    expect(localStorage.length).toBe(0);
  });

  it('writes under a versioned, member-scoped key', () => {
    markOnboardingSeen('abc');
    expect(localStorage.getItem('reservist.onboarded.v1.abc')).toBe('1');
  });

  it('falls back to not-seen when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(hasSeenOnboarding('m1')).toBe(false);
  });

  it('swallows a throwing setItem (tour just re-shows next load)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => markOnboardingSeen('m1')).not.toThrow();
  });
});
