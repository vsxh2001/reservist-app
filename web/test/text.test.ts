import { describe, expect, it } from 'vitest';
import { initialsFromName } from '../src/lib/text';

describe('initialsFromName', () => {
  it('returns 2-char uppercase initials from a two-word name', () => {
    expect(initialsFromName('Yael Cohen')).toBe('YC');
  });

  it('caps at the first two words when more are given', () => {
    expect(initialsFromName('tamar levi avi rosenberg')).toBe('TL');
  });

  it('uppercases when source is lowercase', () => {
    expect(initialsFromName('madonna')).toBe('M');
  });

  it('returns "?" for null', () => {
    expect(initialsFromName(null)).toBe('?');
  });

  it('returns "?" for undefined', () => {
    expect(initialsFromName(undefined)).toBe('?');
  });

  it('returns "?" for empty/whitespace-only strings', () => {
    expect(initialsFromName('')).toBe('?');
    expect(initialsFromName('   ')).toBe('?');
  });

  it('handles multiple spaces between words gracefully', () => {
    expect(initialsFromName('Yael    Cohen')).toBe('YC');
  });
});
