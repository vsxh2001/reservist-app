/**
 * CommanderDayView component tests.
 *
 * Strategy: vi.mock the queries module so useTeamDayAggregate returns
 * controlled data, then mount CommanderDayView directly with a teamId prop.
 * The component itself calls isoDay(new Date()) for its default date, so we
 * don't need to control the clock — we only care about the rendered output.
 *
 * We do NOT mock AuthProvider or QueryClientProvider; CommanderDayView only
 * depends on useTeamDayAggregate (mocked below).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mock the queries module before importing the component.
// ---------------------------------------------------------------------------
const mockUseTeamDayAggregate = vi.fn();

vi.mock('../../src/lib/queries', () => ({
  useTeamDayAggregate: (...args: unknown[]) => mockUseTeamDayAggregate(...args),
}));

// CommanderDayView also imports isoDay from calendarUtils — let it use the
// real implementation (it just formats today's date, which is fine).

import { CommanderDayView } from '../../src/components/CommanderDayView';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEMBER_PICK = {
  memberId: 'm1',
  memberName: 'Alice Cohen',
  initials: 'AC',
  tone: 2,
  status: 'available' as const,
  reasons: [{ kind: 'pick' as const }],
};

const MEMBER_SLOT = {
  memberId: 'm2',
  memberName: 'Bob Levi',
  initials: 'BL',
  tone: 5,
  status: 'standby' as const,
  reasons: [{ kind: 'slot' as const, slotTitle: 'Night patrol' }],
};

function loading() {
  mockUseTeamDayAggregate.mockReturnValue({ data: undefined, isLoading: true, error: null });
}
function empty() {
  mockUseTeamDayAggregate.mockReturnValue({ data: [], isLoading: false, error: null });
}
function withMembers(members: typeof MEMBER_PICK[]) {
  mockUseTeamDayAggregate.mockReturnValue({ data: members, isLoading: false, error: null });
}
function withError(msg: string) {
  mockUseTeamDayAggregate.mockReturnValue({ data: undefined, isLoading: false, error: new Error(msg) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommanderDayView', () => {
  beforeEach(() => {
    mockUseTeamDayAggregate.mockReset();
  });

  it('shows loading state while query is pending', () => {
    loading();
    render(<CommanderDayView teamId="team-1" />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    // member count line should not be visible during loading
    expect(screen.queryByText(/on duty/i)).not.toBeInTheDocument();
  });

  it('shows empty state when no members are on duty', () => {
    empty();
    render(<CommanderDayView teamId="team-1" />);
    expect(screen.getByText(/No members on duty/i)).toBeInTheDocument();
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  it('renders member name and deployment-pick tag for a pick reason', () => {
    withMembers([MEMBER_PICK]);
    render(<CommanderDayView teamId="team-1" />);
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Deployment pick')).toBeInTheDocument();
    // count header: "1 member on duty"
    expect(screen.getByText(/1/)).toBeInTheDocument();
    expect(screen.getByText(/member on duty/)).toBeInTheDocument();
  });

  it('renders slot reason tag with slot title', () => {
    withMembers([MEMBER_SLOT]);
    render(<CommanderDayView teamId="team-1" />);
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    expect(screen.getByText('Slot: Night patrol')).toBeInTheDocument();
  });

  it('renders multiple members and shows correct count', () => {
    withMembers([MEMBER_PICK, MEMBER_SLOT]);
    render(<CommanderDayView teamId="team-1" />);
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    expect(screen.getByText(/members on duty/)).toBeInTheDocument();
  });

  it('shows error message when query fails', () => {
    withError('Network error: timeout');
    render(<CommanderDayView teamId="team-1" />);
    expect(screen.getByText(/Network error: timeout/)).toBeInTheDocument();
    // count line should not render on error
    expect(screen.queryByText(/on duty/i)).not.toBeInTheDocument();
  });

  it('renders a date input whose onChange updates the displayed value', () => {
    withMembers([MEMBER_PICK]);
    render(<CommanderDayView teamId="team-1" />);
    const input = screen.getByLabelText('Select date') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('date');
    // fireEvent.change is reliable for date inputs in happy-dom (userEvent.type
    // does not parse date-format strings correctly in JSDOM/happy-dom).
    fireEvent.change(input, { target: { value: '2025-01-20' } });
    expect(input.value).toBe('2025-01-20');
    // The hook should have been re-called with the new date
    expect(mockUseTeamDayAggregate).toHaveBeenCalledWith('team-1', '2025-01-20');
  });
});
