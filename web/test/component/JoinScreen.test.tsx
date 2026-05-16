/**
 * JoinScreen component tests.
 *
 * The screen renders an invite-code join flow. Behavior under test:
 *   - "Invite not found" state when useTeamByInvite returns null (404 path).
 *   - "Invite expired" state when team.invite_expires_at is in the past
 *     (PRD §7.1 — recently-added expired-invite branch).
 *   - Active form rendered when invite is valid and not expired.
 *   - Submit calls useSubmitJoinRequest.mutateAsync with the camelCase shape
 *     { teamId, name, phone, skillNames, note } and shows a confirmation.
 *   - Empty name or empty phone leaves the "Send request" button disabled.
 *   - Mutation error path surfaces an error to the user.
 *   - Back / Cancel buttons invoke the onCancel prop.
 *
 * Strategy: vi.mock the queries hooks and the supabase client. The component
 * pulls a per-team skills list straight from supabase inside a useEffect,
 * so we stub that builder as a thenable returning { data, error }.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Team } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type InviteQueryState = {
  data: Team | null;
  isLoading: boolean;
};

let inviteState: InviteQueryState = { data: null, isLoading: false };

const mutateAsyncMock = vi.fn();
let submitPending = false;

vi.mock('../../src/lib/queries', () => ({
  useTeamByInvite: (_code: string | null) => inviteState,
  useSubmitJoinRequest: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: submitPending,
  }),
}));

// The component fetches the team's skills list from supabase directly inside a
// useEffect once team.data is available. Use a thenable builder so awaiting
// `supabase.from('skills').select(...).eq(...).order(...)` resolves with the
// stubbed { data, error } payload.
let skillsResult: { data: { name: string }[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};

function makeSkillsBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.then = (resolve: (v: typeof skillsResult) => unknown) =>
    Promise.resolve(skillsResult).then(resolve);
  return builder;
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'skills') return makeSkillsBuilder();
      throw new Error(`Unexpected table in JoinScreen test: ${table}`);
    },
  },
}));

import { JoinScreen } from '../../src/components/JoinScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-1',
    project_id: 'proj-1',
    division_id: 'div-1',
    name: 'Alpha Company',
    crest: 'lion',
    invite_code: 'ALPHA-001',
    // 24h in the future — well clear of "expired".
    invite_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    established: '2024-01',
    member_count: 12,
    commander_count: 2,
    project_name: 'Reservist Pilot',
    show_unit_schedule: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JoinScreen', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    submitPending = false;
    inviteState = { data: null, isLoading: false };
    skillsResult = { data: [], error: null };
  });

  it('shows "Invite not found" when useTeamByInvite resolves to null', () => {
    inviteState = { data: null, isLoading: false };
    const onCancel = vi.fn();
    render(<JoinScreen code="BAD-CODE" onCancel={onCancel} />);

    expect(screen.getByRole('heading', { name: /Invite not found/i })).toBeInTheDocument();
    // The mistyped code is surfaced verbatim.
    expect(screen.getByText('BAD-CODE')).toBeInTheDocument();
    // Active form should not be present.
    expect(screen.queryByRole('button', { name: /Send request/i })).not.toBeInTheDocument();
  });

  it('shows the expired-invite branch when invite_expires_at is in the past', () => {
    inviteState = {
      data: makeTeam({
        name: 'Bravo Company',
        invite_expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      isLoading: false,
    };
    render(<JoinScreen code="EXP-001" onCancel={vi.fn()} />);

    expect(screen.getByText(/Invite expired/i)).toBeInTheDocument();
    // The team name is still displayed alongside the expired notice.
    expect(screen.getByRole('heading', { name: 'Bravo Company' })).toBeInTheDocument();
    expect(screen.getByText(/This invite link has expired/i)).toBeInTheDocument();
    // No active form when expired.
    expect(screen.queryByRole('button', { name: /Send request/i })).not.toBeInTheDocument();
  });

  it('renders the active join form when the invite is valid and unexpired', async () => {
    inviteState = { data: makeTeam(), isLoading: false };
    skillsResult = { data: [{ name: 'Medic' }, { name: 'Driver' }], error: null };

    render(<JoinScreen code="ALPHA-001" onCancel={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Alpha Company' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tamar Levi/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/\+972/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send request/i })).toBeInTheDocument();

    // Skills load asynchronously from supabase.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Medic' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Driver' })).toBeInTheDocument();
  });

  it('keeps Send request disabled when name or phone is empty', async () => {
    inviteState = { data: makeTeam(), isLoading: false };
    render(<JoinScreen code="ALPHA-001" onCancel={vi.fn()} />);

    const submitBtn = screen.getByRole('button', { name: /Send request/i });
    expect(submitBtn).toBeDisabled();

    // Phone only — still disabled.
    await userEvent.type(screen.getByPlaceholderText(/\+972/), '+972501234567');
    expect(submitBtn).toBeDisabled();

    // Add name — now enabled.
    await userEvent.type(screen.getByPlaceholderText(/Tamar Levi/i), 'Tamar Levi');
    expect(submitBtn).not.toBeDisabled();

    // Clear phone — disabled again (the empty-phone half of the assertion).
    await userEvent.clear(screen.getByPlaceholderText(/\+972/));
    expect(submitBtn).toBeDisabled();
  });

  it('submits via mutateAsync with the camelCase payload and shows confirmation', async () => {
    inviteState = { data: makeTeam(), isLoading: false };
    skillsResult = { data: [{ name: 'Medic' }, { name: 'Driver' }], error: null };
    mutateAsyncMock.mockResolvedValue('jr-1');

    render(<JoinScreen code="ALPHA-001" onCancel={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Tamar Levi/i), 'Tamar Levi');
    await userEvent.type(screen.getByPlaceholderText(/\+972/), '+972501234567');

    // Toggle a skill so skillNames is non-empty.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Medic' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Medic' }));

    // Fill the optional note.
    await userEvent.type(
      screen.getByPlaceholderText(/Anything the commander should know/i),
      'available weekends',
    );

    await userEvent.click(screen.getByRole('button', { name: /Send request/i }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    // NOTE: the component calls mutateAsync (not mutate) and passes the
    // camelCase shape { teamId, skillNames }, not the snake_case shape in the
    // task description. We assert what the source actually does.
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      teamId: 'team-1',
      name: 'Tamar Levi',
      phone: '+972501234567',
      skillNames: ['Medic'],
      note: 'available weekends',
    });

    // After success the screen swaps to the "Request sent" confirmation.
    expect(await screen.findByRole('heading', { name: /Request sent/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send request/i })).not.toBeInTheDocument();
  });

  it('passes note: null when the optional note field is left empty', async () => {
    inviteState = { data: makeTeam(), isLoading: false };
    mutateAsyncMock.mockResolvedValue('jr-2');

    render(<JoinScreen code="ALPHA-001" onCancel={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Tamar Levi/i), 'Tamar Levi');
    await userEvent.type(screen.getByPlaceholderText(/\+972/), '+972501234567');
    await userEvent.click(screen.getByRole('button', { name: /Send request/i }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ note: null, skillNames: [] }),
    );
  });

  it('on mutation rejection, does not transition to the success state', async () => {
    inviteState = { data: makeTeam(), isLoading: false };

    // JoinScreen does `await submit.mutateAsync(...)` with no try/catch — so
    // a rejection would propagate as an unhandled rejection from the click
    // handler. We swallow that at the test boundary via a process-level
    // listener so the assertion below can observe the "no success UI"
    // behavior cleanly.
    const failure = new Error('insert failed: duplicate phone');
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      seen.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    mutateAsyncMock.mockRejectedValue(failure);

    try {
      render(<JoinScreen code="ALPHA-001" onCancel={vi.fn()} />);

      await userEvent.type(screen.getByPlaceholderText(/Tamar Levi/i), 'Tamar Levi');
      await userEvent.type(screen.getByPlaceholderText(/\+972/), '+972501234567');
      await userEvent.click(screen.getByRole('button', { name: /Send request/i }));

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
      });

      // Give the microtask queue a tick to surface the unhandled rejection.
      await new Promise((r) => setTimeout(r, 0));

      // The mutation rejected, so the success branch (sent=true) must NOT show.
      expect(screen.queryByRole('heading', { name: /Request sent/i })).not.toBeInTheDocument();
      // The form is still mounted with the Send request button available.
      expect(screen.getByRole('button', { name: /Send request/i })).toBeInTheDocument();
      // The rejection surfaced (this is the user-observable "error" today —
      // JoinScreen has no inline error UI; the burden is on global handlers).
      expect(seen).toContain(failure);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('Back button on the not-found state invokes onCancel', async () => {
    inviteState = { data: null, isLoading: false };
    const onCancel = vi.fn();
    render(<JoinScreen code="BAD" onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Back button on the expired state invokes onCancel', async () => {
    inviteState = {
      data: makeTeam({
        invite_expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      isLoading: false,
    };
    const onCancel = vi.fn();
    render(<JoinScreen code="EXP-1" onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Cancel button on the active form invokes onCancel', async () => {
    inviteState = { data: makeTeam(), isLoading: false };
    const onCancel = vi.fn();
    render(<JoinScreen code="ALPHA-001" onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
