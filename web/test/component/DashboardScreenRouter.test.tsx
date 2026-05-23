/**
 * DashboardScreenRouter tests — pure switch on `active`. Each screen
 * component is mocked to render a marker div so we can verify the right
 * screen mounts for each `active` value without instantiating their full
 * query/mutation graphs.
 *
 * Also pins:
 *   - Loading + error states for the roster screen
 *   - "Admin" route wiring to setTeamId + onSetActive
 *   - SettingsScreen wiring to onSettingsRefresh
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock every screen component to a deterministic marker, capturing the
// props each receives so we can assert wiring without spinning up the
// real components.
const capturedProps: Record<string, unknown[]> = {};
function captureRender(name: string) {
  return (props: Record<string, unknown>) => {
    (capturedProps[name] ??= []).push(props);
    return <div data-testid={`screen-${name.toLowerCase()}`} />;
  };
}

vi.mock('../../src/components/Roster', () => ({ Roster: captureRender('Roster') }));
vi.mock('../../src/components/SlotsScreen', () => ({ SlotsScreen: captureRender('SlotsScreen') }));
vi.mock('../../src/components/ActivityScreen', () => ({ ActivityScreen: captureRender('Activity') }));
vi.mock('../../src/components/SettingsScreen', () => ({ SettingsScreen: captureRender('Settings') }));
vi.mock('../../src/components/RequestsScreen', () => ({ RequestsScreen: captureRender('Requests') }));
vi.mock('../../src/components/CalendarScreen', () => ({ CalendarScreen: captureRender('Calendar') }));
vi.mock('../../src/components/CommanderDayView', () => ({ CommanderDayView: captureRender('Day') }));
vi.mock('../../src/components/DivisionAdminScreen', () => ({ DivisionAdminScreen: captureRender('Admin') }));

import { DashboardScreenRouter } from '../../src/components/DashboardScreenRouter';
import type { Screen, Team } from '../../src/lib/types';

function makeTeam(): Team {
  return {
    id: 't1', project_id: 'p1', division_id: 'd1',
    name: 'Bravo', crest: '🐺',
    invite_code: null, invite_expires_at: null,
    established: null, member_count: 5, commander_count: 1,
    project_name: 'Alpha',
    show_unit_schedule: true,
  } as unknown as Team;
}

function q<T>(data: T): { data: T; isLoading: false; error: null } {
  return { data, isLoading: false, error: null };
}

function makeProps(active: Screen, overrides: Record<string, unknown> = {}) {
  const team = makeTeam();
  const propsBase = {
    active,
    team,
    members: q([]),
    skills: q([]),
    slots: q([]),
    activity: q([]),
    division: q({ id: 'd1', name: 'Division', created_at: '' }),
    filters: { status: [], skills: [], roles: [] } as unknown as Parameters<typeof DashboardScreenRouter>[0]['filters'],
    onFilters: vi.fn(),
    selected: [],
    setSelected: vi.fn(),
    onPerson: vi.fn(),
    onSlotDrawer: vi.fn(),
    onModalOpen: vi.fn(),
    onSetActive: vi.fn(),
    setTeamId: vi.fn(),
    onSettingsRefresh: vi.fn(),
    onToast: vi.fn(),
  };
  return { ...propsBase, ...overrides } as unknown as Parameters<typeof DashboardScreenRouter>[0];
}

describe('DashboardScreenRouter', () => {
  it.each([
    ['roster',   'roster'],
    ['slots',    'slotsscreen'],
    ['activity', 'activity'],
    ['settings', 'settings'],
    ['requests', 'requests'],
    ['calendar', 'calendar'],
    ['day',      'day'],
    ['admin',    'admin'],
  ] as const)('renders the %s screen when active=%s', (active, marker) => {
    render(<DashboardScreenRouter {...makeProps(active as Screen)} />);
    expect(screen.getByTestId(`screen-${marker}`)).toBeInTheDocument();
  });

  it('renders only one screen at a time', () => {
    render(<DashboardScreenRouter {...makeProps('calendar')} />);
    expect(screen.getByTestId('screen-calendar')).toBeInTheDocument();
    expect(screen.queryByTestId('screen-roster')).not.toBeInTheDocument();
    expect(screen.queryByTestId('screen-slotsscreen')).not.toBeInTheDocument();
  });

  it('shows a roster loading state when members.isLoading is true', () => {
    const loadingMembers = { data: undefined, isLoading: true, error: null };
    render(<DashboardScreenRouter {...makeProps('roster', { members: loadingMembers })} />);
    expect(screen.getByText(/Loading roster…/i)).toBeInTheDocument();
    expect(screen.queryByTestId('screen-roster')).not.toBeInTheDocument();
  });

  it('shows the error message when the members query fails', () => {
    const errored = { data: undefined, isLoading: false, error: new Error('boom') };
    render(<DashboardScreenRouter {...makeProps('roster', { members: errored })} />);
    expect(screen.getByText(/Failed: boom/i)).toBeInTheDocument();
    expect(screen.queryByTestId('screen-roster')).not.toBeInTheDocument();
  });

  it('admin screen routes back to roster via onSetActive + setTeamId', async () => {
    const setTeamId = vi.fn();
    const onSetActive = vi.fn();
    capturedProps.Admin = [];
    render(<DashboardScreenRouter {...makeProps('admin', { setTeamId, onSetActive })} />);
    // Pull onOpenTeam from the captured props and exercise it.
    const adminProps = capturedProps.Admin[0] as { onOpenTeam: (id: string) => void };
    adminProps.onOpenTeam('team-77');
    expect(setTeamId).toHaveBeenCalledWith('team-77');
    expect(onSetActive).toHaveBeenCalledWith('roster');
  });

  it('settings screen receives onSettingsRefresh under the onRefresh prop', () => {
    const onSettingsRefresh = vi.fn();
    capturedProps.Settings = [];
    render(<DashboardScreenRouter {...makeProps('settings', { onSettingsRefresh })} />);
    const settingsProps = capturedProps.Settings[0] as { onRefresh: () => void };
    settingsProps.onRefresh();
    expect(onSettingsRefresh).toHaveBeenCalledTimes(1);
  });

  it('SlotsScreen wraps onUrgent → onModalOpen(urgent:true) and onNewSlot → onModalOpen(urgent:false)', () => {
    const onModalOpen = vi.fn();
    capturedProps.SlotsScreen = [];
    render(<DashboardScreenRouter {...makeProps('slots', { onModalOpen })} />);
    const slotsProps = capturedProps.SlotsScreen[0] as { onUrgent: () => void; onNewSlot: () => void };
    slotsProps.onUrgent();
    expect(onModalOpen).toHaveBeenLastCalledWith({ urgent: true, preselected: null });
    slotsProps.onNewSlot();
    expect(onModalOpen).toHaveBeenLastCalledWith({ urgent: false, preselected: null });
  });

  it('roster onNewSlotWith fires onModalOpen with the picked memberId and urgent=false', () => {
    const onModalOpen = vi.fn();
    capturedProps.Roster = [];
    render(<DashboardScreenRouter {...makeProps('roster', { onModalOpen })} />);
    const rosterProps = capturedProps.Roster[0] as { onNewSlotWith: (id: string) => void };
    rosterProps.onNewSlotWith('m-42');
    expect(onModalOpen).toHaveBeenCalledWith({ urgent: false, preselected: 'm-42' });
  });
});
