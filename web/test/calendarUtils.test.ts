import { describe, expect, it } from 'vitest';
import { fmtWhen, relativeAgo, untilHint, windowCountdown } from '../src/lib/calendarUtils';

describe('fmtWhen', () => {
  const now = new Date(2026, 5, 10, 12, 0, 0); // 2026-06-10 12:00 local

  it('returns Today, HH:MM for same calendar day (far future)', () => {
    const iso = new Date(2026, 5, 10, 23, 0).toISOString(); // 11 hr away
    expect(fmtWhen(iso, now)).toBe('Today, 23:00');
  });

  it('appends "in N min" when same-day start is within an hour', () => {
    const iso = new Date(2026, 5, 10, 12, 23).toISOString(); // +23 min
    expect(fmtWhen(iso, now)).toBe('Today, 12:23 · in 23 min');
  });

  it('appends "in N hr" when same-day start is within 5 hours', () => {
    const iso = new Date(2026, 5, 10, 14, 30).toISOString(); // +2.5 hr → rounds to 3 hr
    expect(fmtWhen(iso, now)).toBe('Today, 14:30 · in 3 hr');
  });

  it('returns plain "Today, HH:MM" when start is more than 5 hours away same day', () => {
    const iso = new Date(2026, 5, 10, 18, 0).toISOString(); // +6 hr
    expect(fmtWhen(iso, now)).toBe('Today, 18:00');
  });

  it('returns Today even when start is earlier in the day (no imminent hint for past)', () => {
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

describe('windowCountdown', () => {
  const now = new Date(2026, 5, 10, 9, 0, 0); // 2026-06-10 morning local

  it('returns "starts tomorrow" when start is 1 day out', () => {
    expect(windowCountdown('2026-06-11', '2026-06-15', now)).toBe('starts tomorrow');
  });

  it('returns "starts in N days" for 2-60 day window starts', () => {
    expect(windowCountdown('2026-06-13', '2026-06-20', now)).toBe('starts in 3 days');
    expect(windowCountdown('2026-07-09', '2026-07-12', now)).toBe('starts in 29 days');
  });

  it('returns null when the window starts more than 60 days out', () => {
    expect(windowCountdown('2026-09-01', '2026-09-15', now)).toBeNull();
  });

  it('returns "in progress" when today is between start and end (inclusive)', () => {
    expect(windowCountdown('2026-06-10', '2026-06-12', now)).toBe('in progress');
    expect(windowCountdown('2026-06-05', '2026-06-12', now)).toBe('in progress');
    expect(windowCountdown('2026-06-05', '2026-06-10', now)).toBe('in progress');
  });

  it('returns null when today is past the end date', () => {
    expect(windowCountdown('2026-05-01', '2026-05-10', now)).toBeNull();
  });
});

describe('untilHint', () => {
  const now = new Date(2026, 5, 10, 9, 0, 0);

  it('returns "expires today" when the date is today', () => {
    expect(untilHint('2026-06-10', now)).toBe('expires today');
  });

  it('returns "expires tomorrow" when the date is +1 day', () => {
    expect(untilHint('2026-06-11', now)).toBe('expires tomorrow');
  });

  it('returns "N days left" for 2-30 days out', () => {
    expect(untilHint('2026-06-13', now)).toBe('3 days left');
    expect(untilHint('2026-07-10', now)).toBe('30 days left');
  });

  it('returns "expired" when the date is in the past', () => {
    expect(untilHint('2026-06-09', now)).toBe('expired');
  });

  it('returns null when the date is more than 30 days out', () => {
    expect(untilHint('2026-07-15', now)).toBeNull();
  });

  it('returns null for a malformed date string', () => {
    expect(untilHint('not-a-date', now)).toBeNull();
  });
});

describe('relativeAgo', () => {
  const now = new Date(2026, 5, 10, 12, 0, 0);

  it('returns "just now" within 30 seconds', () => {
    const t = new Date(now.getTime() - 5_000).toISOString();
    expect(relativeAgo(t, now)).toBe('just now');
  });

  it('returns "N min ago" within an hour', () => {
    const t = new Date(now.getTime() - 7 * 60_000).toISOString();
    expect(relativeAgo(t, now)).toBe('7 min ago');
  });

  it('returns "N hr ago" within 24 hours', () => {
    const t = new Date(now.getTime() - 3 * 3_600_000).toISOString();
    expect(relativeAgo(t, now)).toBe('3 hr ago');
  });

  it('returns "1 day ago" at the day boundary', () => {
    const t = new Date(now.getTime() - 30 * 3_600_000).toISOString();
    expect(relativeAgo(t, now)).toBe('1 day ago');
  });

  it('returns "N days ago" up to 30 days', () => {
    const t = new Date(now.getTime() - 5 * 86_400_000).toISOString();
    expect(relativeAgo(t, now)).toBe('5 days ago');
  });

  it('returns "N mo ago" past 30 days', () => {
    const t = new Date(now.getTime() - 90 * 86_400_000).toISOString();
    expect(relativeAgo(t, now)).toBe('3 mo ago');
  });

  it('returns "over a year ago" past 12 months', () => {
    const t = new Date(now.getTime() - 400 * 86_400_000).toISOString();
    expect(relativeAgo(t, now)).toBe('over a year ago');
  });

  it('returns null for a future timestamp', () => {
    const t = new Date(now.getTime() + 60_000).toISOString();
    expect(relativeAgo(t, now)).toBeNull();
  });

  it('returns null for a malformed ISO string', () => {
    expect(relativeAgo('not-a-date', now)).toBeNull();
  });
});
