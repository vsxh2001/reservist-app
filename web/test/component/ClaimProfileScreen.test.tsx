/**
 * ClaimProfileScreen component tests.
 *
 * Under the RLS-tightened world (migration 20260516192409__rls_tightening.sql),
 * an unlinked auth user cannot read `members` directly — they must resolve a
 * team invite code through the SECURITY DEFINER RPCs
 * `list_unclaimed_members_by_invite` and `claim_member_by_invite`.
 *
 * The screen now drives that flow:
 *   1. user enters an invite code → "Look up"
 *   2. the RPC fills in the unclaimed-members list
 *   3. user picks themselves → "Claim" calls the second RPC
 *
 * Since the component goes through react-query hooks (`useUnclaimedMembersByInvite`,
 * `useClaimMemberByInvite`) which call `supabase.rpc(...)`, we mock the supabase
 * client and useAuth, and wrap renders in a QueryClientProvider.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface MockMember {
  id: string;
  name: string;
  initials: string;
  tone: number;
  division_id: string;
}

interface InspectRow {
  status: 'valid' | 'expired' | 'not_found';
  team_id: string | null;
  team_name: string | null;
  division_id: string | null;
}

let listResult: { data: MockMember[] | null; error: { message: string } | null } = {
  data: null,
  error: null,
};
let claimResult: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};
let inspectResult: { data: InspectRow[] | null; error: { message: string } | null } = {
  data: [{ status: 'valid', team_id: 't1', team_name: 'Alpha Co.', division_id: 'div-1' }],
  error: null,
};

const rpcSpy = vi.fn();

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcSpy(fn, args);
      if (fn === 'list_unclaimed_members_by_invite') {
        return Promise.resolve(listResult);
      }
      if (fn === 'claim_member_by_invite') {
        return Promise.resolve(claimResult);
      }
      if (fn === 'inspect_invite') {
        return Promise.resolve(inspectResult);
      }
      throw new Error(`Unexpected RPC in test: ${fn}`);
    },
  },
}));

const refreshLinkMock = vi.fn(async () => {});
const signOutMock = vi.fn(async () => {});

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: null,
    authUser: {
      id: 'auth-user-1',
      email: 'me@example.com',
      user_metadata: { full_name: 'Test User' },
    },
    status: 'no-link',
    signInWithGoogle: vi.fn(),
    signInAsMock: vi.fn(),
    signOut: signOutMock,
    refreshLink: refreshLinkMock,
  }),
}));

import { ClaimProfileScreen } from '../../src/components/ClaimProfileScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ALICE: MockMember = {
  id: 'm1', name: 'Alice Cohen', initials: 'AC', tone: 0, division_id: 'div-1',
};
const BOB: MockMember = {
  id: 'm2', name: 'Bob Levi', initials: 'BL', tone: 1, division_id: 'div-1',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderScreen(node: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaimProfileScreen', () => {
  beforeEach(() => {
    rpcSpy.mockReset();
    refreshLinkMock.mockClear();
    signOutMock.mockClear();
    listResult = { data: [], error: null };
    claimResult = { data: null, error: null };
    inspectResult = {
      data: [{ status: 'valid', team_id: 't1', team_name: 'Alpha Co.', division_id: 'div-1' }],
      error: null,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not call the list RPC until an invite code is submitted', async () => {
    renderScreen(<ClaimProfileScreen />);

    // Header always renders.
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/carmel/i)).toBeInTheDocument();

    // The list RPC has not been called yet — no submitted code.
    await waitFor(() => {
      // negative: assert no RPC call after a tick.
      expect(rpcSpy).not.toHaveBeenCalled();
    });
  });

  it('submitting an invite code calls list_unclaimed_members_by_invite and renders members', async () => {
    listResult = { data: [ALICE, BOB], error: null };
    renderScreen(<ClaimProfileScreen />);

    const codeInput = screen.getByPlaceholderText(/carmel/i);
    await userEvent.type(codeInput, 'carmel-6-J3xK');
    await userEvent.click(screen.getByRole('button', { name: /Look up/i }));

    await waitFor(() => {
      expect(rpcSpy).toHaveBeenCalledWith('list_unclaimed_members_by_invite', {
        p_invite_code: 'carmel-6-J3xK',
      });
    });

    expect(await screen.findByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
  });

  it('shows an empty-state message naming the team when invite is valid but no unclaimed members', async () => {
    listResult = { data: [], error: null };
    inspectResult = {
      data: [{ status: 'valid', team_id: 't1', team_name: 'Mahlaka 6 — Carmel', division_id: 'div-1' }],
      error: null,
    };
    renderScreen(<ClaimProfileScreen />);

    await userEvent.type(screen.getByPlaceholderText(/carmel/i), 'carmel-6-J3xK');
    await userEvent.click(screen.getByRole('button', { name: /Look up/i }));

    expect(
      await screen.findByText(/No unclaimed members for/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Mahlaka 6 — Carmel')).toBeInTheDocument();
  });

  it('shows "expired" messaging when inspect_invite returns status=expired', async () => {
    listResult = { data: [], error: null };
    inspectResult = {
      data: [{ status: 'expired', team_id: null, team_name: 'Bravo Co.', division_id: null }],
      error: null,
    };
    renderScreen(<ClaimProfileScreen />);

    await userEvent.type(screen.getByPlaceholderText(/carmel/i), 'stale-code');
    await userEvent.click(screen.getByRole('button', { name: /Look up/i }));

    expect(await screen.findByText(/invite has expired/i)).toBeInTheDocument();
    expect(screen.getByText('Bravo Co.')).toBeInTheDocument();
  });

  it('shows "didn\'t match any team" when inspect_invite returns status=not_found', async () => {
    listResult = { data: [], error: null };
    inspectResult = {
      data: [{ status: 'not_found', team_id: null, team_name: null, division_id: null }],
      error: null,
    };
    renderScreen(<ClaimProfileScreen />);

    await userEvent.type(screen.getByPlaceholderText(/carmel/i), 'zzz-bogus');
    await userEvent.click(screen.getByRole('button', { name: /Look up/i }));

    expect(await screen.findByText(/didn't match any team/i)).toBeInTheDocument();
  });

  it('initialInviteCode pre-submits the code and skips the manual lookup', async () => {
    listResult = { data: [ALICE], error: null };
    renderScreen(<ClaimProfileScreen initialInviteCode="carmel-6-J3xK" />);

    await waitFor(() => {
      expect(rpcSpy).toHaveBeenCalledWith('list_unclaimed_members_by_invite', {
        p_invite_code: 'carmel-6-J3xK',
      });
    });
    expect(await screen.findByText('Alice Cohen')).toBeInTheDocument();
  });

  it('claim button is disabled until a member is picked', async () => {
    listResult = { data: [ALICE], error: null };
    renderScreen(<ClaimProfileScreen initialInviteCode="carmel-6-J3xK" />);

    await screen.findByText('Alice Cohen');
    const claimBtn = screen.getByRole('button', { name: /^Claim$/i });
    expect(claimBtn).toBeDisabled();

    await userEvent.click(screen.getByText('Alice Cohen'));
    expect(claimBtn).not.toBeDisabled();
  });

  it('clicking Claim calls claim_member_by_invite with the right args', async () => {
    listResult = { data: [ALICE, BOB], error: null };
    claimResult = { data: null, error: null };
    renderScreen(<ClaimProfileScreen initialInviteCode="carmel-6-J3xK" />);

    await userEvent.click(await screen.findByText('Bob Levi'));
    await userEvent.click(screen.getByRole('button', { name: /^Claim$/i }));

    await waitFor(() => {
      expect(rpcSpy).toHaveBeenCalledWith('claim_member_by_invite', {
        p_member_id: 'm2',
        p_invite_code: 'carmel-6-J3xK',
        p_email: 'me@example.com',
      });
    });
    await waitFor(() => {
      expect(refreshLinkMock).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an error message when the claim RPC rejects', async () => {
    listResult = { data: [ALICE], error: null };
    claimResult = { data: null, error: { message: 'Row was already claimed' } };
    renderScreen(<ClaimProfileScreen initialInviteCode="carmel-6-J3xK" />);

    await userEvent.click(await screen.findByText('Alice Cohen'));
    await userEvent.click(screen.getByRole('button', { name: /^Claim$/i }));

    expect(await screen.findByText(/Row was already claimed/i)).toBeInTheDocument();
    expect(refreshLinkMock).not.toHaveBeenCalled();
  });

  it('filters members by the search input', async () => {
    listResult = { data: [ALICE, BOB], error: null };
    renderScreen(<ClaimProfileScreen initialInviteCode="carmel-6-J3xK" />);

    await screen.findByText('Alice Cohen');
    const search = screen.getByPlaceholderText(/Search by name/i);
    await userEvent.type(search, 'bob');

    expect(screen.queryByText('Alice Cohen')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
  });
});
