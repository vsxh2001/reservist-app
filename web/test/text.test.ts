import { describe, expect, it } from 'vitest';
import { initialsFromName, splitName } from '../src/lib/text';

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

describe('splitName', () => {
  it('returns first + rest for a two-word name', () => {
    expect(splitName('Yael Cohen')).toEqual({ first: 'Yael', rest: 'Cohen' });
  });

  it('joins all trailing words into rest', () => {
    expect(splitName('Tamar Levi Avi Rosenberg')).toEqual({ first: 'Tamar', rest: 'Levi Avi Rosenberg' });
  });

  it('returns empty rest for a single-word name', () => {
    expect(splitName('Madonna')).toEqual({ first: 'Madonna', rest: '' });
  });

  it('returns empty strings for null / undefined / empty / whitespace', () => {
    expect(splitName(null)).toEqual({ first: '', rest: '' });
    expect(splitName(undefined)).toEqual({ first: '', rest: '' });
    expect(splitName('')).toEqual({ first: '', rest: '' });
    expect(splitName('   ')).toEqual({ first: '', rest: '' });
  });

  it('collapses multiple inner spaces', () => {
    expect(splitName('Yael    Cohen   Levi')).toEqual({ first: 'Yael', rest: 'Cohen Levi' });
  });
});
