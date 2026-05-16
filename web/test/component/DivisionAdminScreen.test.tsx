/**
 * DivisionAdminScreen component tests.
 *
 * The screen wires up many queries/mutations from `src/lib/queries`:
 *   queries   — useDivision, useProjects, useTeamsForDivision,
 *               useMembersInDivision, useMyMember, useSkills
 *   mutations — useCreateProject, useUpdateProject, useCreateTeam,
 *               useUpdateTeam, useSetDivisionAdmin, useAddSkill, useDeleteSkill
 * It also consumes useActiveTeam (team-context) and useAuth.
 *
 * We mock all of those so the component can render without a backend.
 *
 * Coverage skipped (intentional):
 *   - Self-revoke guard (`m.id === actorId && currentlyAdmin` → toast). The
 *     "Revoke" button is `disabled` in that case so the click never reaches the
 *     handler from the DOM; asserting on the disabled state is sufficient and
 *     covered indirectly by the admin-list render test.
 *   - Inline crest emoji change for new teams — only the create-team payload
 *     matters for this screen's wiring; we use the default crest fallback.
 *   - "Open team" button (onOpenTeam prop) — orthogonal navigation glue.
 *   - Error branches on mutation rejection (toast with e.message) — same
 *     mutation shape, exercised by other component tests.
 *   - Loading branch (`Loading…` placeholder) — trivial and would require
 *     toggling isLoading on three independent query mocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Member, Team, Project, Division } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks — must precede the component import.
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'me-1', name: 'Admin Me' },
    authUser: null,
    status: 'linked',
  }),
}));

// useActiveTeam: provides the fallback first team id when teamsForDiv is empty.
const activeTeams: Team[] = [];
vi.mock('../../src/lib/team-context', () => ({
  useActiveTeam: () => ({
    team: null,
    teams: activeTeams,
    setTeamId: vi.fn(),
  }),
}));

// Query state — mutated per test before mounting.
let divisionData: Division | undefined = {
  id: 'div-1',
  name: 'Test Division',
  created_at: '2024-01-01T00:00:00Z',
};
let projectsData: Project[] = [];
let teamsForDivData: Team[] = [];
let membersData: Member[] = [];
let skillsData: string[] = [];
let myMemberData: Member | null = null;

const createProjectMutateAsync = vi.fn();
const updateProjectMutateAsync = vi.fn();
const createTeamMutateAsync = vi.fn();
const updateTeamMutateAsync = vi.fn();
const setAdminMutateAsync = vi.fn();
const addSkillMutateAsync = vi.fn();
const delSkillMutateAsync = vi.fn();

vi.mock('../../src/lib/queries', () => ({
  useDivision:           () => ({ data: divisionData,    isLoading: false }),
  useProjects:           () => ({ data: projectsData,    isLoading: false }),
  useTeamsForDivision:   () => ({ data: teamsForDivData, isLoading: false }),
  useMembersInDivision:  () => ({ data: membersData,     isLoading: false }),
  useSkills:             () => ({ data: skillsData,      isLoading: false }),
  useMyMember:           () => ({ data: myMemberData,    isLoading: false }),

  useCreateProject:      () => ({ mutateAsync: createProjectMutateAsync, isPending: false }),
  useUpdateProject:      () => ({ mutateAsync: updateProjectMutateAsync, isPending: false }),
  useCreateTeam:         () => ({ mutateAsync: createTeamMutateAsync,    isPending: false }),
  useUpdateTeam:         () => ({ mutateAsync: updateTeamMutateAsync,    isPending: false }),
  useSetDivisionAdmin:   () => ({ mutateAsync: setAdminMutateAsync,      isPending: false }),
  useAddSkill:           () => ({ mutateAsync: addSkillMutateAsync,      isPending: false }),
  useDeleteSkill:        () => ({ mutateAsync: delSkillMutateAsync,      isPending: false }),
}));

import { DivisionAdminScreen } from '../../src/components/DivisionAdminScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'm-1',
    division_id: 'div-1',
    name: 'Member One',
    initials: 'M1',
    tone: 1,
    phone: '+972 50-000-0001',
    joined: '2023-01',
    last_seen: null,
    calls_this_year: 0,
    status: 'available',
    status_note: null,
    status_until: null,
    status_set_at: new Date().toISOString(),
    is_division_admin: false,
    phone_visible_to_peers: false,
    skills: [],
    teams: [],
    ...overrides,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-1',
    project_id: 'proj-1',
    division_id: 'div-1',
    name: 'Alpha Team',
    crest: '🦁',
    invite_code: 'alpha-001',
    invite_expires_at: null,
    established: '2023-01',
    member_count: 5,
    commander_count: 1,
    project_name: 'Pilot',
    show_unit_schedule: false,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    division_id: 'div-1',
    name: 'Pilot',
    sort_idx: 0,
    ...overrides,
  };
}

function renderScreen() {
  const onOpenTeam = vi.fn();
  const onToast = vi.fn();
  const utils = render(
    <DivisionAdminScreen onOpenTeam={onOpenTeam} onToast={onToast} />,
  );
  return { ...utils, onOpenTeam, onToast };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DivisionAdminScreen', () => {
  beforeEach(() => {
    createProjectMutateAsync.mockReset();
    updateProjectMutateAsync.mockReset();
    createTeamMutateAsync.mockReset();
    updateTeamMutateAsync.mockReset();
    setAdminMutateAsync.mockReset();
    addSkillMutateAsync.mockReset();
    delSkillMutateAsync.mockReset();

    createProjectMutateAsync.mockResolvedValue('new-proj-id');
    updateProjectMutateAsync.mockResolvedValue(undefined);
    createTeamMutateAsync.mockResolvedValue('new-team-id');
    updateTeamMutateAsync.mockResolvedValue(undefined);
    setAdminMutateAsync.mockResolvedValue(undefined);
    addSkillMutateAsync.mockResolvedValue(undefined);
    delSkillMutateAsync.mockResolvedValue(undefined);

    // Reset data
    divisionData = { id: 'div-1', name: 'Test Division', created_at: '2024-01-01T00:00:00Z' };
    projectsData = [];
    teamsForDivData = [];
    membersData = [];
    skillsData = [];
    myMemberData = makeMember({ id: 'me-1', name: 'Admin Me', is_division_admin: true });
    activeTeams.length = 0;
  });

  // -------- admin list --------------------------------------------------

  it('renders the list of current division admins', () => {
    membersData = [
      makeMember({ id: 'me-1', name: 'Admin Me', initials: 'AM', is_division_admin: true }),
      makeMember({ id: 'm-2', name: 'Other Admin', initials: 'OA', is_division_admin: true }),
      makeMember({ id: 'm-3', name: 'Plain Joe', initials: 'PJ', is_division_admin: false }),
    ];
    renderScreen();

    expect(screen.getByText('Division admins')).toBeInTheDocument();
    expect(screen.getByText('Admin Me')).toBeInTheDocument();
    expect(screen.getByText('Other Admin')).toBeInTheDocument();
  });

  it('renders the non-admin "Grant admin to a member" sublist with Make-admin buttons', () => {
    membersData = [
      makeMember({ id: 'me-1', name: 'Admin Me', is_division_admin: true }),
      makeMember({ id: 'm-3', name: 'Plain Joe', is_division_admin: false }),
      makeMember({ id: 'm-4', name: 'Jane Civilian', is_division_admin: false }),
    ];
    renderScreen();

    expect(screen.getByText(/Grant admin to a member/i)).toBeInTheDocument();
    expect(screen.getByText('Plain Joe')).toBeInTheDocument();
    expect(screen.getByText('Jane Civilian')).toBeInTheDocument();

    const makeAdminBtns = screen.getAllByRole('button', { name: /Make admin/i });
    expect(makeAdminBtns).toHaveLength(2);
  });

  it('shows "No division admins yet." when admin list is empty', () => {
    membersData = [makeMember({ id: 'm-3', name: 'Plain Joe', is_division_admin: false })];
    renderScreen();
    expect(screen.getByText(/No division admins yet/i)).toBeInTheDocument();
  });

  // -------- admin grant / revoke ---------------------------------------

  it('"Make admin" submits useSetDivisionAdmin with isAdmin: true', async () => {
    const user = userEvent.setup();
    membersData = [
      makeMember({ id: 'me-1', name: 'Admin Me', is_division_admin: true }),
      makeMember({ id: 'm-3', name: 'Plain Joe', is_division_admin: false }),
    ];
    teamsForDivData = [makeTeam({ id: 'team-1' })];
    const { onToast } = renderScreen();

    await user.click(screen.getByRole('button', { name: /Make admin/i }));

    await waitFor(() => {
      expect(setAdminMutateAsync).toHaveBeenCalledTimes(1);
    });
    const arg = setAdminMutateAsync.mock.calls[0][0];
    expect(arg).toMatchObject({
      memberId: 'm-3',
      isAdmin: true,
      actorId: 'me-1',
      actorName: 'Admin Me',
      memberName: 'Plain Joe',
      unitId: 'team-1',
    });
    expect(onToast).toHaveBeenCalledWith('Plain Joe is now a division admin');
  });

  it('"Revoke" on another admin submits useSetDivisionAdmin with isAdmin: false', async () => {
    const user = userEvent.setup();
    membersData = [
      makeMember({ id: 'me-1', name: 'Admin Me', is_division_admin: true }),
      makeMember({ id: 'm-2', name: 'Other Admin', is_division_admin: true }),
    ];
    teamsForDivData = [makeTeam({ id: 'team-1' })];
    const { onToast } = renderScreen();

    // Two Revoke buttons; the one for Admin Me (m-1) is disabled.
    const revokeBtns = screen.getAllByRole('button', { name: /Revoke/i });
    // Click the enabled one (Other Admin).
    const enabled = revokeBtns.find((b) => !(b as HTMLButtonElement).disabled);
    expect(enabled).toBeTruthy();
    await user.click(enabled!);

    await waitFor(() => {
      expect(setAdminMutateAsync).toHaveBeenCalledTimes(1);
    });
    const arg = setAdminMutateAsync.mock.calls[0][0];
    expect(arg).toMatchObject({
      memberId: 'm-2',
      isAdmin: false,
      actorId: 'me-1',
      actorName: 'Admin Me',
      memberName: 'Other Admin',
      unitId: 'team-1',
    });
    expect(onToast).toHaveBeenCalledWith('Revoked admin from Other Admin');
  });

  // -------- projects + teams tree --------------------------------------

  it('renders the projects + teams tree with member/commander counts', () => {
    projectsData = [
      makeProject({ id: 'proj-1', name: 'Pilot' }),
      makeProject({ id: 'proj-2', name: 'Logistics', sort_idx: 1 }),
    ];
    teamsForDivData = [
      makeTeam({ id: 'team-1', project_id: 'proj-1', name: 'Alpha', crest: '🦁', member_count: 5, commander_count: 1 }),
      makeTeam({ id: 'team-2', project_id: 'proj-1', name: 'Bravo', crest: '🐯', member_count: 3, commander_count: 2 }),
      makeTeam({ id: 'team-3', project_id: 'proj-2', name: 'Charlie', crest: '🦅', member_count: 1, commander_count: 1 }),
    ];
    renderScreen();

    expect(screen.getByText(/Projects & teams/i)).toBeInTheDocument();
    expect(screen.getByText('Pilot')).toBeInTheDocument();
    expect(screen.getByText('Logistics')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();

    // "2 teams" for Pilot, "1 team" for Logistics
    expect(screen.getByText('2 teams')).toBeInTheDocument();
    expect(screen.getByText('1 team')).toBeInTheDocument();

    // Member-count line e.g. "5 members · 1 cmd"
    expect(screen.getByText(/5 members · 1 cmd/)).toBeInTheDocument();
    expect(screen.getByText(/3 members · 2 cmd/)).toBeInTheDocument();
    expect(screen.getByText(/1 member · 1 cmd/)).toBeInTheDocument();
  });

  it('renders "No projects yet" empty state when projects list is empty', () => {
    projectsData = [];
    renderScreen();
    expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
  });

  // -------- create project ---------------------------------------------

  it('Create-project inline form submits useCreateProject', async () => {
    const user = userEvent.setup();
    projectsData = [makeProject({ id: 'proj-1', name: 'Pilot' })];
    teamsForDivData = [makeTeam({ id: 'team-1' })];
    const { onToast } = renderScreen();

    await user.click(screen.getByRole('button', { name: /New project/i }));
    const input = screen.getByPlaceholderText(/Project name/i);
    await user.type(input, '  Recon  ');
    await user.click(screen.getByRole('button', { name: /^Create$/ }));

    await waitFor(() => {
      expect(createProjectMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(createProjectMutateAsync).toHaveBeenCalledWith({
      divisionId: 'div-1',
      name: 'Recon',
      sortIdx: 1, // (projects.data ?? []).length
      actorId: 'me-1',
      actorName: 'Admin Me',
      unitId: 'team-1',
    });
    expect(onToast).toHaveBeenCalledWith('Project "Recon" created');
  });

  // -------- create team within a project -------------------------------

  it('Create-team within a project submits useCreateTeam', async () => {
    const user = userEvent.setup();
    projectsData = [makeProject({ id: 'proj-1', name: 'Pilot' })];
    teamsForDivData = [makeTeam({ id: 'team-1', project_id: 'proj-1' })];
    const { onToast } = renderScreen();

    // Each project card has a "New team" button.
    await user.click(screen.getByRole('button', { name: /New team/i }));
    // Type name; leave the crest blank to hit the default '🏴' fallback.
    const nameInput = screen.getByPlaceholderText(/Team name/i);
    await user.type(nameInput, 'Echo');
    await user.click(screen.getByRole('button', { name: /^Create$/ }));

    await waitFor(() => {
      expect(createTeamMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(createTeamMutateAsync).toHaveBeenCalledWith({
      projectId: 'proj-1',
      divisionId: 'div-1',
      name: 'Echo',
      crest: '🏴',
      actorId: 'me-1',
      actorName: 'Admin Me',
      unitId: 'team-1',
    });
    expect(onToast).toHaveBeenCalledWith('Team "Echo" created');
  });

  // -------- rename project via inline edit -----------------------------

  it('Renaming a project via InlineEdit submits useUpdateProject', async () => {
    const user = userEvent.setup();
    projectsData = [makeProject({ id: 'proj-1', name: 'Pilot' })];
    teamsForDivData = [makeTeam({ id: 'team-1', project_id: 'proj-1' })];
    const { onToast } = renderScreen();

    // Click the project name to enter edit mode.
    await user.click(screen.getByText('Pilot'));
    // Now the InlineEdit input is focused; clear it and type a new name.
    // The input is the only one with no placeholder among the project area
    // (the "Project name" inline form is closed). Grab it by current value.
    const inputs = screen.getAllByRole('textbox');
    const editInput = inputs.find(
      (el) => (el as HTMLInputElement).value === 'Pilot',
    ) as HTMLInputElement;
    expect(editInput).toBeTruthy();
    await user.clear(editInput);
    await user.type(editInput, 'Pilot Renamed');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(updateProjectMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(updateProjectMutateAsync).toHaveBeenCalledWith({
      projectId: 'proj-1',
      patch: { name: 'Pilot Renamed' },
      actorId: 'me-1',
      actorName: 'Admin Me',
      unitId: 'team-1',
    });
    expect(onToast).toHaveBeenCalledWith('Project renamed to "Pilot Renamed"');
  });

  // -------- skills section ---------------------------------------------

  it('renders existing skill tags with counts', () => {
    skillsData = ['Medic', 'Driver', 'Sniper'];
    renderScreen();
    expect(screen.getByText(/Skill tags \(3\) · division-wide/)).toBeInTheDocument();
    expect(screen.getByText('Medic')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
    expect(screen.getByText('Sniper')).toBeInTheDocument();
  });

  it('shows "No skills yet" when the skills list is empty', () => {
    skillsData = [];
    renderScreen();
    expect(screen.getByText(/No skills yet/i)).toBeInTheDocument();
  });

  it('Add-skill via button submits useAddSkill with { divisionId, name }', async () => {
    const user = userEvent.setup();
    skillsData = [];
    const { onToast } = renderScreen();

    const input = screen.getByPlaceholderText(/New skill tag/i);
    await user.type(input, '  Comms  ');
    await user.click(screen.getByRole('button', { name: /Add skill/i }));

    await waitFor(() => {
      expect(addSkillMutateAsync).toHaveBeenCalledWith({
        divisionId: 'div-1',
        name: 'Comms',
      });
    });
    expect(onToast).toHaveBeenCalledWith('Skill "Comms" added');
  });

  it('Add-skill via Enter key submits useAddSkill', async () => {
    const user = userEvent.setup();
    skillsData = [];
    const { onToast } = renderScreen();

    const input = screen.getByPlaceholderText(/New skill tag/i);
    await user.type(input, 'Recon{Enter}');

    await waitFor(() => {
      expect(addSkillMutateAsync).toHaveBeenCalledWith({
        divisionId: 'div-1',
        name: 'Recon',
      });
    });
    expect(onToast).toHaveBeenCalledWith('Skill "Recon" added');
  });

  it('Remove-skill submits useDeleteSkill', async () => {
    const user = userEvent.setup();
    skillsData = ['Medic', 'Driver'];
    const { onToast } = renderScreen();

    const removeBtns = screen.getAllByTitle('Remove');
    expect(removeBtns).toHaveLength(2);
    await user.click(removeBtns[0]);

    await waitFor(() => {
      expect(delSkillMutateAsync).toHaveBeenCalledWith({
        divisionId: 'div-1',
        name: 'Medic',
      });
    });
    expect(onToast).toHaveBeenCalledWith('Skill "Medic" removed');
  });
});
