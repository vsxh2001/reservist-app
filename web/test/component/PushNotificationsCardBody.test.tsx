import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PushNotificationsCardBody } from '../../src/components/PushNotificationsCardBody';

describe('PushNotificationsCardBody', () => {
  it('renders the loading placeholder while pushSub is "loading"', () => {
    render(
      <PushNotificationsCardBody
        pushSub="loading"
        pushBusy={false}
        hasUser
        onEnable={() => {}}
        onDisable={() => {}}
        onTest={() => {}}
      />,
    );
    expect(screen.getByText(/Checking notification status/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the enabled state with Disable + Send test buttons when pushSub is a subscription', () => {
    const fake = { endpoint: 'https://x' } as unknown as PushSubscription;
    render(
      <PushNotificationsCardBody
        pushSub={fake}
        pushBusy={false}
        hasUser
        onEnable={() => {}}
        onDisable={() => {}}
        onTest={() => {}}
      />,
    );
    expect(screen.getByText(/Push notifications are/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Disable push/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send test push/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enable push/i })).not.toBeInTheDocument();
  });

  it('renders the disabled state with an Enable push button when pushSub is null', () => {
    render(
      <PushNotificationsCardBody
        pushSub={null}
        pushBusy={false}
        hasUser
        onEnable={() => {}}
        onDisable={() => {}}
        onTest={() => {}}
      />,
    );
    const enable = screen.getByRole('button', { name: /Enable push/i });
    expect(enable).toBeInTheDocument();
    expect(enable).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: /Disable push/i })).not.toBeInTheDocument();
  });

  it('disables the Enable button when hasUser is false', () => {
    render(
      <PushNotificationsCardBody
        pushSub={null}
        pushBusy={false}
        hasUser={false}
        onEnable={() => {}}
        onDisable={() => {}}
        onTest={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Enable push/i })).toBeDisabled();
  });

  it('disables both Disable + Test buttons when pushBusy is true', () => {
    const fake = { endpoint: 'https://x' } as unknown as PushSubscription;
    render(
      <PushNotificationsCardBody
        pushSub={fake}
        pushBusy
        hasUser
        onEnable={() => {}}
        onDisable={() => {}}
        onTest={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Disable push/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Send test push/i })).toBeDisabled();
  });

  it('clicking the action buttons fires the corresponding callback', async () => {
    const user = userEvent.setup();
    const onEnable = vi.fn();
    const onDisable = vi.fn();
    const onTest = vi.fn();
    const fake = { endpoint: 'https://x' } as unknown as PushSubscription;

    const { rerender } = render(
      <PushNotificationsCardBody
        pushSub={null}
        pushBusy={false}
        hasUser
        onEnable={onEnable}
        onDisable={onDisable}
        onTest={onTest}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Enable push/i }));
    expect(onEnable).toHaveBeenCalledTimes(1);

    rerender(
      <PushNotificationsCardBody
        pushSub={fake}
        pushBusy={false}
        hasUser
        onEnable={onEnable}
        onDisable={onDisable}
        onTest={onTest}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Disable push/i }));
    expect(onDisable).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Send test push/i }));
    expect(onTest).toHaveBeenCalledTimes(1);
  });

  it('honors the buttonGap prop on the enabled-state action row', () => {
    const fake = { endpoint: 'https://x' } as unknown as PushSubscription;
    const { container, rerender } = render(
      <PushNotificationsCardBody
        pushSub={fake}
        pushBusy={false}
        hasUser
        onEnable={() => {}}
        onDisable={() => {}}
        onTest={() => {}}
        buttonGap={8}
      />,
    );
    // The flex row wrapping the buttons is the parent of "Disable push".
    const row8 = (screen.getByRole('button', { name: /Disable push/i }).parentElement) as HTMLElement;
    expect(row8.style.gap).toBe('8px');

    rerender(
      <PushNotificationsCardBody
        pushSub={fake}
        pushBusy={false}
        hasUser
        onEnable={() => {}}
        onDisable={() => {}}
        onTest={() => {}}
        buttonGap={6}
      />,
    );
    const row6 = (screen.getByRole('button', { name: /Disable push/i }).parentElement) as HTMLElement;
    expect(row6.style.gap).toBe('6px');
    expect(container).toBeTruthy();
  });
});
