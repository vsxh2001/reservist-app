import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the push module before importing the hook so the hook captures the
// mocked references. Each test resets the mocks via vi.clearAllMocks().
vi.mock('../src/lib/push', () => ({
  currentSubscription: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
  sendTestPush: vi.fn(),
}));

import { usePushSubscription } from '../src/lib/usePushSubscription';
import {
  currentSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestPush,
} from '../src/lib/push';

const mockedCurrent = vi.mocked(currentSubscription);
const mockedSubscribe = vi.mocked(subscribeToPush);
const mockedUnsubscribe = vi.mocked(unsubscribeFromPush);
const mockedTest = vi.mocked(sendTestPush);

describe('usePushSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with pushSub="loading" and resolves to the current subscription', async () => {
    const fakeSub = { endpoint: 'https://push/fake' } as unknown as PushSubscription;
    mockedCurrent.mockResolvedValueOnce(fakeSub);
    const toast = vi.fn();
    const { result } = renderHook(() => usePushSubscription('user-1', toast));
    expect(result.current.pushSub).toBe('loading');
    await waitFor(() => expect(result.current.pushSub).toBe(fakeSub));
    expect(toast).not.toHaveBeenCalled();
  });

  it('resolves to null when no subscription is present', async () => {
    mockedCurrent.mockResolvedValueOnce(null);
    const toast = vi.fn();
    const { result } = renderHook(() => usePushSubscription('user-1', toast));
    await waitFor(() => expect(result.current.pushSub).toBeNull());
  });

  it('handleEnablePush short-circuits with a toast when userId is undefined', async () => {
    mockedCurrent.mockResolvedValueOnce(null);
    const toast = vi.fn();
    const { result } = renderHook(() => usePushSubscription(undefined, toast));
    await waitFor(() => expect(result.current.pushSub).toBeNull());
    await act(async () => { await result.current.handleEnablePush(); });
    expect(toast).toHaveBeenCalledWith('Sign in to enable notifications');
    expect(mockedSubscribe).not.toHaveBeenCalled();
  });

  it('handleEnablePush on success refreshes pushSub and toasts', async () => {
    const fakeSub = { endpoint: 'https://push/fake' } as unknown as PushSubscription;
    mockedCurrent.mockResolvedValueOnce(null).mockResolvedValueOnce(fakeSub);
    mockedSubscribe.mockResolvedValueOnce({ ok: true });
    const toast = vi.fn();
    const { result } = renderHook(() => usePushSubscription('user-7', toast));
    await waitFor(() => expect(result.current.pushSub).toBeNull());
    await act(async () => { await result.current.handleEnablePush(); });
    expect(mockedSubscribe).toHaveBeenCalledWith('user-7');
    expect(result.current.pushSub).toBe(fakeSub);
    expect(toast).toHaveBeenCalledWith('Push notifications enabled');
    expect(result.current.pushBusy).toBe(false);
  });

  it('handleEnablePush on failure toasts the reason and leaves pushSub null', async () => {
    mockedCurrent.mockResolvedValueOnce(null);
    mockedSubscribe.mockResolvedValueOnce({ ok: false, reason: 'denied' });
    const toast = vi.fn();
    const { result } = renderHook(() => usePushSubscription('user-7', toast));
    await waitFor(() => expect(result.current.pushSub).toBeNull());
    await act(async () => { await result.current.handleEnablePush(); });
    expect(toast).toHaveBeenCalledWith('denied');
    expect(result.current.pushSub).toBeNull();
  });

  it('handleEnablePush falls back to a generic message when no reason is given', async () => {
    mockedCurrent.mockResolvedValueOnce(null);
    mockedSubscribe.mockResolvedValueOnce({ ok: false });
    const toast = vi.fn();
    const { result } = renderHook(() => usePushSubscription('user-7', toast));
    await waitFor(() => expect(result.current.pushSub).toBeNull());
    await act(async () => { await result.current.handleEnablePush(); });
    expect(toast).toHaveBeenCalledWith('Failed to enable push');
  });

  it('handleDisablePush clears pushSub and toasts', async () => {
    const fakeSub = { endpoint: 'https://push/fake' } as unknown as PushSubscription;
    mockedCurrent.mockResolvedValueOnce(fakeSub);
    mockedUnsubscribe.mockResolvedValueOnce(undefined);
    const toast = vi.fn();
    const { result } = renderHook(() => usePushSubscription('user-7', toast));
    await waitFor(() => expect(result.current.pushSub).toBe(fakeSub));
    await act(async () => { await result.current.handleDisablePush(); });
    expect(mockedUnsubscribe).toHaveBeenCalledWith('user-7');
    expect(result.current.pushSub).toBeNull();
    expect(toast).toHaveBeenCalledWith('Push notifications disabled');
  });

  it('handleDisablePush is a no-op when userId is undefined', async () => {
    mockedCurrent.mockResolvedValueOnce(null);
    const toast = vi.fn();
    const { result } = renderHook(() => usePushSubscription(undefined, toast));
    await waitFor(() => expect(result.current.pushSub).toBeNull());
    await act(async () => { await result.current.handleDisablePush(); });
    expect(mockedUnsubscribe).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('handleTestPush triggers sendTestPush and toasts', async () => {
    mockedCurrent.mockResolvedValueOnce(null);
    mockedTest.mockResolvedValueOnce(undefined);
    const toast = vi.fn();
    const { result } = renderHook(() => usePushSubscription('user-7', toast));
    await waitFor(() => expect(result.current.pushSub).toBeNull());
    await act(async () => { await result.current.handleTestPush(); });
    expect(mockedTest).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith('Test notification sent — check your device');
    expect(result.current.pushBusy).toBe(false);
  });
});
