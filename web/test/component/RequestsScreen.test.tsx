/**
 * RequestsScreen component tests.
 *
 * RequestsScreen renders the commander's join-request approval queue.
 * It pulls:
 *   - useAuth()             → AuthProvider; vi.mock'd for a stable user
 *   - useJoinRequests()     → react-query result; vi.mock'd
 *   - useDivision()         → react-query result; vi.mock'd
 *   - useApproveJoinRequest() / useRejectJoinRequest() — mutation hooks, vi.mock'd
 *
 * Coverage skipped (not in the actual component):
 *   - "Renders resolved requests in a separate section" — the screen renders a
 *     single list. `useJoinRequests` returns whatever the caller filters in;
 *     RequestsScreen itself has no resolved/all toggle and no separate section.
 *   - Filter UX (pending only / all) — RequestsScreen has no filter controls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JoinRequest, Team } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks — must precede the component import.
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'cmdr1', name: 'Commander Test' },
    authUser: null,
    status: 'linked',
  }),
}));

const mockJoinRequests = {
  data: [] as JoinRequest[] | undefined,
  isLoading: false,
};
const mockDivision = {
  data: { id: 'div1', name: 'Alpha Division', created_at: '2024-01-01T00:00:00Z' },
};
const mockApprove = { mutateAsync: vi.fn(), isPending: false };
const mockReject  = { mutateAsync: vi.fn(), isPending: false };

vi.mock('../../src/lib/queries', () => ({
  useJoinRequests:        () => mockJoinRequests,
  useDivision:            () => mockDivision,
  useApproveJoinRequest:  () => mockApprove,
  useRejectJoinRequest:   () => mockReject,
}));

import { RequestsScreen } from '../../src/components/RequestsScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team1',
    project_id: 'proj1',
    division_id: 'div1',
    name: 'Alpha Squad',
    crest: 'AS',
    invite_code: 'ABC123',
    invite_expires_at: null,
    established: '2023-01',
    member_count: 12,
    commander_count: 2,
    project_name: 'Project North',
    show_unit_schedule: true,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<JoinRequest> = {}): JoinRequest {
  return {
    id: 'r1',
    team_id: 'team1',
    name: 'Dana Cohen',
    phone: '+972 52-000-0001',
    skill_names: [],
    note: null,
    state: 'pending',
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by: null,
    ...overrides,
  };
}

function renderScreen(opts: { team?: Partial<Team> } = {}) {
  const team = makeTeam(opts.team);
  const onToast = vi.fn();
  const utils = render(<RequestsScreen team={team} onToast={onToast} />);
  return { ...utils, team, onToast };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RequestsScreen', () => {
  beforeEach(() => {
    mockJoinRequests.data = [];
    mockJoinRequests.isLoading = false;
    mockApprove.mutateAsync.mockReset();
    mockReject.mutateAsync.mockReset();
    mockApprove.mutateAsync.mockResolvedValue(undefined);
    mockReject.mutateAsync.mockResolvedValue(undefined);
    mockApprove.isPending = false;
    mockReject.isPending = false;
  });

  // -------- loading state -------------------------------------------------

  it('shows a loading line while the query is pending', () => {
    mockJoinRequests.isLoading = true;
    mockJoinRequests.data = undefined;
    renderScreen();
    // The loader uses an em-dash variant of "Loading…"; match by prefix.
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  // -------- empty state ---------------------------------------------------

  it('renders the empty-state when there are no pending requests', () => {
    mockJoinRequests.data = [];
    renderScreen();
    expect(screen.getByText(/No pending requests/i)).toBeInTheDocument();
    // The empty state hints at sharing the invite link via Settings.
    expect(screen.getByText(/Share the invite link/i)).toBeInTheDocument();
  });

  // -------- rendering pending requests -----------------------------------

  it('renders request cards with name, phone, skills, and note', () => {
    mockJoinRequests.data = [
      makeRequest({
        id: 'r1',
        name: 'Dana Cohen',
        phone: '+972 52-111-2222',
        skill_names: ['Driving', 'Marksmanship'],
        note: 'Available weekends',
        created_at: new Date().toISOString(),
      }),
    ];
    renderScreen();

    expect(screen.getByText('Dana Cohen')).toBeInTheDocument();
    expect(screen.getByText(/\+972 52-111-2222/)).toBeInTheDocument();
    expect(screen.getByText('Driving')).toBeInTheDocument();
    expect(screen.getByText('Marksmanship')).toBeInTheDocument();
    // Note is rendered inside quotes — match by content substring.
    expect(screen.getByText(/Available weekends/)).toBeInTheDocument();
  });

  it('omits the skills row when skill_names is empty', () => {
    mockJoinRequests.data = [
      makeRequest({ name: 'No Skills', skill_names: [], note: null }),
    ];
    renderScreen();
    // No Tag elements rendered for this request — sanity-check via a known skill
    // name not appearing.
    expect(screen.queryByText('Driving')).not.toBeInTheDocument();
  });

  it('omits the note block when note is null', () => {
    mockJoinRequests.data = [
      makeRequest({ id: 'rA', name: 'Quiet Type', note: null }),
    ];
    const { container } = renderScreen();
    // The italic blockquote-style note has fontStyle italic; absence of the
    // request's note text is the simplest assertion.
    expect(container.textContent).not.toMatch(/^"/);
  });

  it('renders one card per pending request', () => {
    mockJoinRequests.data = [
      makeRequest({ id: 'r1', name: 'Alice Cohen' }),
      makeRequest({ id: 'r2', name: 'Bob Levi' }),
      makeRequest({ id: 'r3', name: 'Carol Paz' }),
    ];
    renderScreen();
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    expect(screen.getByText('Carol Paz')).toBeInTheDocument();
    // Each card has its own Approve / Reject button pair.
    expect(screen.getAllByRole('button', { name: /Approve/i })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /Reject/i })).toHaveLength(3);
  });

  // -------- relative date formatting -------------------------------------

  describe('created_at formatting (fmtRel)', () => {
    beforeEach(() => {
      // Pin "now" to a deterministic instant.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-16T12:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows "just now" when created < 60s ago', () => {
      mockJoinRequests.data = [
        makeRequest({ id: 'r1', name: 'Fresh One', created_at: '2026-05-16T11:59:30Z' }),
      ];
      renderScreen();
      expect(screen.getByText(/just now/)).toBeInTheDocument();
    });

    it('shows "<n> min ago" when created < 1h ago', () => {
      mockJoinRequests.data = [
        makeRequest({ id: 'r1', name: 'Minutes', created_at: '2026-05-16T11:45:00Z' }),
      ];
      renderScreen();
      expect(screen.getByText(/15 min ago/)).toBeInTheDocument();
    });

    it('shows "<n>h ago" when created < 1d ago', () => {
      mockJoinRequests.data = [
        makeRequest({ id: 'r1', name: 'Hours', created_at: '2026-05-16T09:00:00Z' }),
      ];
      renderScreen();
      expect(screen.getByText(/3h ago/)).toBeInTheDocument();
    });

    it('shows "<n>d ago" when created ≥ 1d ago', () => {
      mockJoinRequests.data = [
        makeRequest({ id: 'r1', name: 'Days', created_at: '2026-05-13T12:00:00Z' }),
      ];
      renderScreen();
      expect(screen.getByText(/3d ago/)).toBeInTheDocument();
    });
  });

  // -------- approve mutation ---------------------------------------------

  it('Approve calls useApproveJoinRequest.mutateAsync with the request payload and toasts', async () => {
    const user = userEvent.setup();
    mockJoinRequests.data = [
      makeRequest({
        id: 'r1',
        team_id: 'team1',
        name: 'Dana Cohen',
        phone: '+972 52-111-2222',
        skill_names: ['Driving'],
      }),
    ];
    const { onToast } = renderScreen({ team: { id: 'team1', division_id: 'div1' } });

    await user.click(screen.getByRole('button', { name: /Approve/i }));

    expect(mockApprove.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockApprove.mutateAsync.mock.calls[0][0];
    expect(arg.requestId).toBe('r1');
    expect(arg.teamId).toBe('team1');
    expect(arg.divisionId).toBe('div1');
    expect(arg.actorId).toBe('cmdr1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.name).toBe('Dana Cohen');
    expect(arg.phone).toBe('+972 52-111-2222');
    expect(arg.skillNames).toEqual(['Driving']);

    expect(onToast).toHaveBeenCalledWith('Approved Dana Cohen');
  });

  it('falls back to team.division_id when useDivision().data is missing', async () => {
    const user = userEvent.setup();
    mockDivision.data = undefined as unknown as typeof mockDivision.data;
    mockJoinRequests.data = [
      makeRequest({ id: 'r1', name: 'Dana Cohen' }),
    ];
    try {
      renderScreen({ team: { id: 'team1', division_id: 'div-fallback' } });
      await user.click(screen.getByRole('button', { name: /Approve/i }));
      expect(mockApprove.mutateAsync.mock.calls[0][0].divisionId).toBe('div-fallback');
    } finally {
      mockDivision.data = { id: 'div1', name: 'Alpha Division', created_at: '2024-01-01T00:00:00Z' };
    }
  });

  // -------- reject mutation ----------------------------------------------

  it('Reject calls useRejectJoinRequest.mutateAsync with the request payload and toasts', async () => {
    const user = userEvent.setup();
    mockJoinRequests.data = [
      makeRequest({ id: 'r2', team_id: 'team1', name: 'Bob Levi' }),
    ];
    const { onToast } = renderScreen({ team: { id: 'team1' } });

    await user.click(screen.getByRole('button', { name: /Reject/i }));

    expect(mockReject.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockReject.mutateAsync.mock.calls[0][0];
    expect(arg.requestId).toBe('r2');
    expect(arg.teamId).toBe('team1');
    expect(arg.actorId).toBe('cmdr1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.name).toBe('Bob Levi');

    expect(onToast).toHaveBeenCalledWith('Rejected Bob Levi');
  });

  // -------- pending-state button disables --------------------------------

  it('disables Approve button while the approve mutation is pending', () => {
    mockApprove.isPending = true;
    mockJoinRequests.data = [makeRequest({ id: 'r1', name: 'Pending Soul' })];
    renderScreen();
    expect(screen.getByRole('button', { name: /Approve/i })).toBeDisabled();
  });

  it('disables Reject button while the reject mutation is pending', () => {
    mockReject.isPending = true;
    mockJoinRequests.data = [makeRequest({ id: 'r1', name: 'Pending Soul' })];
    renderScreen();
    expect(screen.getByRole('button', { name: /Reject/i })).toBeDisabled();
  });

  // -------- multi-row isolation ------------------------------------------

  it('Approve on row #2 sends row #2 id, not row #1', async () => {
    const user = userEvent.setup();
    mockJoinRequests.data = [
      makeRequest({ id: 'rOne', name: 'First Person' }),
      makeRequest({ id: 'rTwo', name: 'Second Person' }),
    ];
    renderScreen();

    // Scope to the second card's Approve button via the card containing the
    // second person's name.
    const secondName = screen.getByText('Second Person');
    const card = secondName.closest('div[style*="grid-template-columns"]')
      ?? secondName.parentElement?.parentElement;
    expect(card).not.toBeNull();
    const secondApprove = within(card as HTMLElement).getByRole('button', { name: /Approve/i });
    await user.click(secondApprove);

    expect(mockApprove.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockApprove.mutateAsync.mock.calls[0][0].requestId).toBe('rTwo');
    expect(mockApprove.mutateAsync.mock.calls[0][0].name).toBe('Second Person');
  });
});
