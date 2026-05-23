/**
 * MyPhoneVisibilityCard tests — owns useSetPhoneVisibility, so we mock
 * lib/queries to inject a controllable mutation object. The component is
 * otherwise small enough that one render + a couple click cases covers it.
 *
 * Pattern follows DeploymentWindowDrawer.test.tsx (vi.mock factory exposing
 * deterministic mutation hooks).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSetPhoneVisibility = { mutate: vi.fn(), isPending: false };

vi.mock('../../src/lib/queries', () => ({
  useSetPhoneVisibility: () => mockSetPhoneVisibility,
}));

import { MyPhoneVisibilityCard } from '../../src/components/MyPhoneVisibilityCard';
import type { Member } from '../../src/lib/types';

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'me',
    division_id: 'div1',
    name: 'Alon Cohen',
    initials: 'AC',
    tone: 0,
    phone: '0541234567',
    joined: null,
    last_seen: null,
    calls_this_year: 0,
    status: 'available',
    status_note: null,
    status_until: null,
    status_set_at: new Date().toISOString(),
    is_division_admin: false,
    phone_visible_to_peers: true,
    skills: [],
    teams: [],
    ...overrides,
  } as unknown as Member;
}

describe('MyPhoneVisibilityCard', () => {
  beforeEach(() => {
    mockSetPhoneVisibility.mutate.mockReset();
    mockSetPhoneVisibility.isPending = false;
  });

  it('marks On as active when phone_visible_to_peers is true', () => {
    render(<MyPhoneVisibilityCard member={makeMember({ phone_visible_to_peers: true })} onToast={() => {}} />);
    expect(screen.getByRole('button', { name: 'On' })).toHaveAttribute('data-on', '1');
    expect(screen.getByRole('button', { name: 'Off' })).toHaveAttribute('data-on', '0');
  });

  it('marks Off as active when phone_visible_to_peers is false', () => {
    render(<MyPhoneVisibilityCard member={makeMember({ phone_visible_to_peers: false })} onToast={() => {}} />);
    expect(screen.getByRole('button', { name: 'On' })).toHaveAttribute('data-on', '0');
    expect(screen.getByRole('button', { name: 'Off' })).toHaveAttribute('data-on', '1');
  });

  it('shows the formatted phone preview when visible', () => {
    render(<MyPhoneVisibilityCard member={makeMember({ phone_visible_to_peers: true, phone: '0541234567' })} onToast={() => {}} />);
    const preview = screen.getByTestId('phone-visibility-preview');
    expect(preview).toHaveTextContent(/Peers in your division see:/);
    // fmtPhoneIL inserts a space after the prefix; assert a digit run survived.
    expect(preview.textContent).toMatch(/\d/);
  });

  it('shows "hidden" in the preview when not visible', () => {
    render(<MyPhoneVisibilityCard member={makeMember({ phone_visible_to_peers: false })} onToast={() => {}} />);
    expect(screen.getByTestId('phone-visibility-preview')).toHaveTextContent(/hidden/);
  });

  it('does not call mutate when clicking the already-active state', async () => {
    render(<MyPhoneVisibilityCard member={makeMember({ phone_visible_to_peers: true })} onToast={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'On' }));
    expect(mockSetPhoneVisibility.mutate).not.toHaveBeenCalled();
  });

  it('calls mutate with visible=false when clicking Off from a visible state', async () => {
    render(<MyPhoneVisibilityCard member={makeMember({ phone_visible_to_peers: true })} onToast={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(mockSetPhoneVisibility.mutate).toHaveBeenCalledTimes(1);
    expect(mockSetPhoneVisibility.mutate.mock.calls[0][0]).toMatchObject({
      memberId: 'me',
      visible: false,
    });
  });

  it('calls mutate with visible=true when clicking On from a hidden state', async () => {
    render(<MyPhoneVisibilityCard member={makeMember({ phone_visible_to_peers: false })} onToast={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'On' }));
    expect(mockSetPhoneVisibility.mutate.mock.calls[0][0]).toMatchObject({
      memberId: 'me',
      visible: true,
    });
  });

  it('disables both buttons while the mutation is in flight', () => {
    mockSetPhoneVisibility.isPending = true;
    render(<MyPhoneVisibilityCard member={makeMember()} onToast={() => {}} />);
    expect(screen.getByRole('button', { name: 'On' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  });

  it('forwards success toast when the mutation resolves', async () => {
    const onToast = vi.fn();
    // Make mutate invoke its `onSuccess` callback synchronously like a
    // resolved promise would.
    mockSetPhoneVisibility.mutate.mockImplementation((_vars, opts) => {
      opts?.onSuccess?.();
    });
    render(<MyPhoneVisibilityCard member={makeMember({ phone_visible_to_peers: true })} onToast={onToast} />);
    await userEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(onToast).toHaveBeenCalledWith('Phone hidden from peers');
  });
});
