import { describe, expect, it } from 'vitest';
import { normalizePhoneToE164IL } from '../src/lib/phone';

describe('normalizePhoneToE164IL', () => {
  it('converts dashed IL mobile to 972-prefixed E.164', () => {
    expect(normalizePhoneToE164IL('054-1234567')).toBe('972541234567');
  });

  it('converts plain IL mobile (10 digits, leading 0)', () => {
    expect(normalizePhoneToE164IL('0541234567')).toBe('972541234567');
  });

  it('strips inner whitespace from IL mobile', () => {
    expect(normalizePhoneToE164IL('054 123 4567')).toBe('972541234567');
  });

  it('keeps already-country-coded IL number (with leading + and spaces)', () => {
    expect(normalizePhoneToE164IL('+972 54 123 4567')).toBe('972541234567');
  });

  it('returns null for whitespace-only input', () => {
    expect(normalizePhoneToE164IL('  ')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(normalizePhoneToE164IL('abc')).toBeNull();
  });

  it('passes through foreign country-coded numbers (digits-only)', () => {
    expect(normalizePhoneToE164IL('+1 555 123 4567')).toBe('15551234567');
  });

  it('returns null for empty string', () => {
    expect(normalizePhoneToE164IL('')).toBeNull();
  });

  it('returns null for too-short numbers (< 9 digits)', () => {
    expect(normalizePhoneToE164IL('12345678')).toBeNull();
  });

  it('returns null for too-long numbers (> 15 digits)', () => {
    expect(normalizePhoneToE164IL('1234567890123456')).toBeNull();
  });

  it('handles parentheses and punctuation', () => {
    expect(normalizePhoneToE164IL('(054) 123-4567')).toBe('972541234567');
  });
});
