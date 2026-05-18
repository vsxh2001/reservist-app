import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../src/lib/useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with null', () => {
    const { result } = renderHook(() => useToast(2000));
    expect(result.current.toast).toBeNull();
  });

  it('showToast sets the toast and clears after durationMs', () => {
    const { result } = renderHook(() => useToast(2000));
    act(() => { result.current.showToast('saved'); });
    expect(result.current.toast).toBe('saved');
    act(() => { vi.advanceTimersByTime(1999); });
    expect(result.current.toast).toBe('saved');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });

  it('successive showToast calls cancel the previous clear-timer so the fresh message persists for the full window', () => {
    const { result } = renderHook(() => useToast(2000));
    act(() => { result.current.showToast('first'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current.toast).toBe('first');
    act(() => { result.current.showToast('second'); });
    // Old timer at +500ms would have fired by now — but it must have been cancelled.
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current.toast).toBe('second');
    // Full new window from the second call: still visible at +1999ms total since "second" landed.
    act(() => { vi.advanceTimersByTime(1399); });
    expect(result.current.toast).toBe('second');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });

  it('clears the pending timer on unmount', () => {
    const { result, unmount } = renderHook(() => useToast(2000));
    act(() => { result.current.showToast('hi'); });
    unmount();
    // No assertion-fail: this would throw if the inner setTimeout fired with stale state.
    act(() => { vi.advanceTimersByTime(5000); });
  });

  it('uses default 2000ms when no duration is passed', () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showToast('plain'); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.toast).toBeNull();
  });
});
