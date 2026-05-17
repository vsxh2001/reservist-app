import { describe, expect, it } from 'vitest';
import { fmtWhen } from '../src/lib/calendarUtils';

describe('fmtWhen', () => {
  const now = new Date(2026, 5, 10, 12, 0, 0); // 2026-06-10 12:00 local

  it('returns Today, HH:MM for same calendar day', () => {
    const iso = new Date(2026, 5, 10, 14, 30).toISOString();
    expect(fmtWhen(iso, now)).toBe('Today, 14:30');
  });

  it('returns Today even when start is earlier in the day', () => {
    const iso = new Date(2026, 5, 10, 6, 5).toISOString();
    expect(fmtWhen(iso, now)).toBe('Today, 06:05');
  });

  it('returns Tomorrow for the next calendar day', () => {
    const iso = new Date(2026, 5, 11, 9, 0).toISOString();
    expect(fmtWhen(iso, now)).toBe('Tomorrow, 09:00');
  });

  it('returns Yesterday for the prior calendar day', () => {
    const iso = new Date(2026, 5, 9, 20, 0).toISOString();
    expect(fmtWhen(iso, now)).toBe('Yesterday, 20:00');
  });

  it('returns an "in N days · weekday" hint for 2–6 days out', () => {
    const iso = new Date(2026, 5, 13, 8, 15).toISOString(); // +3 days
    expect(fmtWhen(iso, now)).toBe('in 3 days · Sat, Jun 13, 08:15');
  });

  it('falls back to weekday/date/time for ≥7 days out', () => {
    const iso = new Date(2026, 5, 17, 18, 0).toISOString(); // +7 days
    expect(fmtWhen(iso, now)).toBe('Wed, Jun 17, 18:00');
  });

  it('falls back to weekday/date/time for >1 day in the past', () => {
    const iso = new Date(2026, 5, 7, 10, 30).toISOString(); // -3 days
    expect(fmtWhen(iso, now)).toBe('Sun, Jun 7, 10:30');
  });

  it('zero-pads single-digit hours and minutes', () => {
    const iso = new Date(2026, 5, 10, 7, 5).toISOString();
    expect(fmtWhen(iso, now)).toBe('Today, 07:05');
  });
});
