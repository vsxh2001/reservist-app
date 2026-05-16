/**
 * ClaimProfileScreen component tests.
 *
 * The screen reads unclaimed members from `members_view` and lets the signed-in
 * auth user attach their auth.users.id to a chosen members row by updating
 * `members`. Both calls go directly through the `supabase` client, so we
 * vi.mock the client and useAuth.
 *
 * Supabase query shape used by the component:
 *   List:   supabase.from('members_view').select(...).order(...) then (await)
 *   Claim:  supabase.from('members').update(...).eq(...).is(...)   then (await)
 *
 * The mock returns a thenable so the awaited builders resolve to the data we
 * supply per test. Mutation arguments are captured via the spies on
 * update / eq / is so we can assert them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface MockRow {
  id: string;
  name: string;
  initials: string;
  tone: number;
  status: string;
  auth_user_id: string | null;
}

// Test-controllable state for the supabase mock.
let membersViewResult: { data: MockRow[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};
let membersUpdateResult: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};

const selectSpy = vi.fn();
const orderSpy = vi.fn();
const updateSpy = vi.fn();
const eqSpy = vi.fn();
const isSpy = vi.fn();
const fromSpy = vi.fn();

function makeMembersViewBuilder() {
  // The builder is a thenable so `await builder` (or `.then(cb)`) resolves to
  // membersViewResult. We also return `this` from chainable methods so
  // .select(...).order(...) keeps working.
  const builder: Record<string, unknown> = {};
  builder.select = (...args: unknown[]) => { selectSpy(...args); return builder; };
  builder.order = (...args: unknown[]) => { orderSpy(...args); return builder; };
  builder.then = (resolve: (v: typeof membersViewResult) => unknown) =>
    Promise.resolve(membersViewResult).then(resolve);
  return builder;
}

function makeMembersBuilder() {
  const builder: Record<string, unknown> = {};
  builder.update = (...args: unknown[]) => { updateSpy(...args); return builder; };
  builder.eq = (...args: unknown[]) => { eqSpy(...args); return builder; };
  builder.is = (...args: unknown[]) => { isSpy(...args); return builder; };
  builder.then = (resolve: (v: typeof membersUpdateResult) => unknown) =>
    Promise.resolve(membersUpdateResult).then(resolve);
  return builder;
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromSpy(table);
      if (table === 'members_view') return makeMembersViewBuilder();
      if (table === 'members') return makeMembersBuilder();
      throw new Error(`Unexpected table in test: ${table}`);
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

const ALICE: MockRow = {
  id: 'm1', name: 'Alice Cohen', initials: 'AC', tone: 0,
  status: 'available', auth_user_id: null,
};
const BOB: MockRow = {
  id: 'm2', name: 'Bob Levi', initials: 'BL', tone: 1,
  status: 'unavailable', auth_user_id: null,
};
// Already-linked member should be filtered out before render.
const LINKED: MockRow = {
  id: 'm3', name: 'Linked Person', initials: 'LP', tone: 2,
  status: 'available', auth_user_id: 'someone-else',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaimProfileScreen', () => {
  beforeEach(() => {
    selectSpy.mockReset();
    orderSpy.mockReset();
    updateSpy.mockReset();
    eqSpy.mockReset();
    isSpy.mockReset();
    fromSpy.mockReset();
    refreshLinkMock.mockClear();
    signOutMock.mockClear();
    membersViewResult = { data: [], error: null };
    membersUpdateResult = { data: null, error: null };
  });

  it('renders the list of unclaimed members and skips already-linked ones', async () => {
    membersViewResult = { data: [ALICE, BOB, LINKED], error: null };
    render(<ClaimProfileScreen />);

    expect(await screen.findByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    // Already-linked member is filtered out by the component.
    expect(screen.queryByText('Linked Person')).not.toBeInTheDocument();
    // Header shows the signed-in user's name.
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('shows the empty state when no unclaimed members exist', async () => {
    membersViewResult = { data: [], error: null };
    render(<ClaimProfileScreen />);

    expect(
      await screen.findByText(/All members are already linked/i),
    ).toBeInTheDocument();
  });

  it('claim button is disabled until a member is picked', async () => {
    membersViewResult = { data: [ALICE], error: null };
    render(<ClaimProfileScreen />);

    await screen.findByText('Alice Cohen');
    const claimBtn = screen.getByRole('button', { name: /Claim/i });
    expect(claimBtn).toBeDisabled();

    await userEvent.click(screen.getByText('Alice Cohen'));
    expect(claimBtn).not.toBeDisabled();
  });

  it('selecting a member and clicking Claim issues the update with the right args', async () => {
    membersViewResult = { data: [ALICE, BOB], error: null };
    membersUpdateResult = { data: null, error: null };
    render(<ClaimProfileScreen />);

    await userEvent.click(await screen.findByText('Bob Levi'));
    await userEvent.click(screen.getByRole('button', { name: /Claim/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
    expect(updateSpy).toHaveBeenCalledWith({
      auth_user_id: 'auth-user-1',
      email: 'me@example.com',
    });
    expect(eqSpy).toHaveBeenCalledWith('id', 'm2');
    // Race-guard: only update rows still unclaimed.
    expect(isSpy).toHaveBeenCalledWith('auth_user_id', null);
    // After success, the auth provider's refreshLink should be invoked.
    await waitFor(() => {
      expect(refreshLinkMock).toHaveBeenCalledTimes(1);
    });
  });

  it('disables the Claim button while the mutation is in flight', async () => {
    membersViewResult = { data: [ALICE], error: null };

    // Hold the update promise open until we choose to resolve it.
    let resolveUpdate: (v: typeof membersUpdateResult) => void = () => {};
    const pending = new Promise<typeof membersUpdateResult>((res) => { resolveUpdate = res; });
    // Replace the `then` on the next members builder by overriding the
    // builder factory just for this test via the result + monkey-patching.
    // Simpler: stash a flag-based delay in membersUpdateResult.then by
    // wrapping the supabase mock — but the existing mock already calls
    // Promise.resolve(membersUpdateResult). To inject a delay, we set
    // membersUpdateResult to a thenable that defers.
    membersUpdateResult = pending as unknown as typeof membersUpdateResult;

    render(<ClaimProfileScreen />);
    await userEvent.click(await screen.findByText('Alice Cohen'));
    const claimBtn = screen.getByRole('button', { name: /Claim/i });
    await userEvent.click(claimBtn);

    // While pending, the button must be disabled.
    await waitFor(() => {
      expect(claimBtn).toBeDisabled();
    });

    // Resolve the mutation and ensure the busy state lifts.
    resolveUpdate({ data: null, error: null });
    await waitFor(() => {
      expect(refreshLinkMock).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an error message when the claim mutation rejects', async () => {
    membersViewResult = { data: [ALICE], error: null };
    membersUpdateResult = { data: null, error: { message: 'Row was already claimed' } };

    render(<ClaimProfileScreen />);
    await userEvent.click(await screen.findByText('Alice Cohen'));
    await userEvent.click(screen.getByRole('button', { name: /Claim/i }));

    expect(await screen.findByText(/Row was already claimed/i)).toBeInTheDocument();
    // On error, refreshLink must NOT be called (still no link).
    expect(refreshLinkMock).not.toHaveBeenCalled();
  });

  it('filters members by the search input', async () => {
    membersViewResult = { data: [ALICE, BOB], error: null };
    render(<ClaimProfileScreen />);

    await screen.findByText('Alice Cohen');
    const search = screen.getByPlaceholderText(/Search by name/i);
    await userEvent.type(search, 'bob');

    expect(screen.queryByText('Alice Cohen')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
  });
});
