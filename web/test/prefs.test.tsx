import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { PrefsProvider, usePrefs } from '../src/lib/prefs';

const KEY = 'reservist.prefs';

function wrapper({ children }: { children: React.ReactNode }) {
  return <PrefsProvider>{children}</PrefsProvider>;
}

describe('PrefsProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
  });

  it('exposes the LTR/en defaults when storage is empty', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper });
    expect(result.current.dir).toBe('ltr');
    expect(result.current.lang).toBe('en');
  });

  it('mirrors dir + lang onto <html> on mount', () => {
    renderHook(() => usePrefs(), { wrapper });
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
  });

  it('persists setDir to localStorage and updates the <html> dir attribute', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper });
    act(() => { result.current.setDir('rtl'); });
    expect(result.current.dir).toBe('rtl');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ dir: 'rtl', lang: 'en' });
  });

  it('persists setLang to localStorage and updates the <html> lang attribute', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper });
    act(() => { result.current.setLang('he'); });
    expect(result.current.lang).toBe('he');
    expect(document.documentElement.getAttribute('lang')).toBe('he');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ dir: 'ltr', lang: 'he' });
  });

  it('setDir does not clobber lang, and vice versa', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper });
    act(() => { result.current.setLang('he'); });
    act(() => { result.current.setDir('rtl'); });
    expect(result.current).toMatchObject({ dir: 'rtl', lang: 'he' });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ dir: 'rtl', lang: 'he' });
  });

  it('rehydrates a prior selection from localStorage on mount', () => {
    localStorage.setItem(KEY, JSON.stringify({ dir: 'rtl', lang: 'he' }));
    const { result } = renderHook(() => usePrefs(), { wrapper });
    expect(result.current.dir).toBe('rtl');
    expect(result.current.lang).toBe('he');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('he');
  });

  it('merges partial stored prefs over defaults (missing key → default)', () => {
    localStorage.setItem(KEY, JSON.stringify({ dir: 'rtl' }));
    const { result } = renderHook(() => usePrefs(), { wrapper });
    expect(result.current.dir).toBe('rtl');
    expect(result.current.lang).toBe('en');
  });

  it('falls back to defaults when stored JSON is corrupt', () => {
    localStorage.setItem(KEY, '{not valid json');
    const { result } = renderHook(() => usePrefs(), { wrapper });
    expect(result.current.dir).toBe('ltr');
    expect(result.current.lang).toBe('en');
  });

  it('throws a clear error when usePrefs is called outside the provider', () => {
    // Silence the expected React error console.error from the thrown hook.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => usePrefs())).toThrow(/usePrefs outside PrefsProvider/);
    spy.mockRestore();
  });
});
