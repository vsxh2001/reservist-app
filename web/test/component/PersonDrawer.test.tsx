/**
 * PersonDrawer component tests.
 *
 * PersonDrawer is the commander's per-reservist drawer. It pulls all member
 * data through the `person` prop and exercises six query/mutation hooks:
 *   - useUpdateStatus, useUpdateTeamMembership, useRemoveTeamMembership,
 *     useDeleteMember, useSetMemberSkill, useRemoveMemberSkill
 *   - useCreateDeploymentWindow (write) + useMemberDeploymentWindows (query)
 *   - useTeamsForMember (query) — used to pretty-print team names and to power
 *     the "add to a team" picker.
 * useAuth is mocked to provide a stable commander user.
 *
 * Coverage skipped:
 *   - DeploymentWindowDrawer interactions — out of scope (own test file).
 *   - Confirm-remove-from-team auto-close-drawer side-effect when the removed
 *     team is the currently-viewed team — exercised indirectly via the close
 *     branch, but only the mutation+toast path is asserted here to keep the
 *     test focused on PersonDrawer's wiring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Member, Team } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks — must precede the component import.
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'commander-1', name: 'Commander Test' },
    authUser: null,
    status: 'linked',
  }),
}));

const mockUpdateStatus       = { mutateAsync: vi.fn(), isPending: false };
const mockUpdateMembership   = { mutateAsync: vi.fn(), isPending: false };
const mockRemoveMembership   = { mutateAsync: vi.fn(), isPending: false };
const mockDeleteMember       = { mutateAsync: vi.fn(), isPending: false };
const mockSetSkill           = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
const mockRemoveSkill        = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
const mockCreateWindow       = { mutateAsync: vi.fn(), isPending: false };

// useTeamsForMember and useMemberDeploymentWindows return query-shaped objects
// where the component reads `.data ?? []`.
const teamsForMemberData: Team[] = [];
const memberWindowsData: never[] = [];

vi.mock('../../src/lib/queries', () => ({
  useUpdateStatus:            () => mockUpdateStatus,
  useUpdateTeamMembership:    () => mockUpdateMembership,
  useRemoveTeamMembership:    () => mockRemoveMembership,
  useDeleteMember:            () => mockDeleteMember,
  useSetMemberSkill:          () => mockSetSkill,
  useRemoveMemberSkill:       () => mockRemoveSkill,
  useCreateDeploymentWindow:  () => mockCreateWindow,
  useMemberDeploymentWindows: () => ({ data: memberWindowsData }),
  useTeamsForMember:          () => ({ data: teamsForMemberData }),
}));

import { PersonDrawer } from '../../src/components/PersonDrawer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'm-alpha',
    division_id: 'div-1',
    name: 'Alice Cohen',
    initials: 'AC',
    tone: 2,
    phone: '+972 52-000-0001',
    joined: '2023-01',
    last_seen: '2 days ago',
    calls_this_year: 4,
    status: 'available',
    status_note: null,
    status_until: null,
    status_set_at: new Date().toISOString(),
    is_division_admin: false,
    skills: [{ name: 'Driving', level: 'intermediate' }],
    teams: [{ team_id: 'team-1', role: 'soldier' }],
    ...overrides,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-1',
    project_id: 'proj-1',
    division_id: 'div-1',
    name: 'Alpha Team',
    crest: 'lion',
    invite_code: 'alpha-001',
    invite_expires_at: null,
    established: '2023-01',
    member_count: 8,
    commander_count: 2,
    project_name: 'Pilot',
    show_unit_schedule: false,
    ...overrides,
  };
}

interface RenderOpts {
  person?: Partial<Member>;
  team?: Partial<Team>;
  allSkills?: string[];
}

function renderDrawer(opts: RenderOpts = {}) {
  const person = makeMember(opts.person);
  const team = makeTeam(opts.team);
  const allSkills = opts.allSkills ?? ['Driving', 'Medic', 'Sniper'];
  const onClose = vi.fn();
  const onToast = vi.fn();
  const utils = render(
    <PersonDrawer
      person={person}
      team={team}
      allSkills={allSkills}
      divisionId="div-1"
      onClose={onClose}
      onToast={onToast}
    />,
  );
  return { ...utils, person, team, onClose, onToast };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PersonDrawer', () => {
  beforeEach(() => {
    mockUpdateStatus.mutateAsync.mockReset();
    mockUpdateMembership.mutateAsync.mockReset();
    mockRemoveMembership.mutateAsync.mockReset();
    mockDeleteMember.mutateAsync.mockReset();
    mockSetSkill.mutate.mockReset();
    mockSetSkill.mutateAsync.mockReset();
    mockRemoveSkill.mutate.mockReset();
    mockRemoveSkill.mutateAsync.mockReset();
    mockCreateWindow.mutateAsync.mockReset();

    mockUpdateStatus.mutateAsync.mockResolvedValue(undefined);
    mockUpdateMembership.mutateAsync.mockResolvedValue(undefined);
    mockRemoveMembership.mutateAsync.mockResolvedValue(undefined);
    mockDeleteMember.mutateAsync.mockResolvedValue(undefined);
    mockCreateWindow.mutateAsync.mockResolvedValue(undefined);

    teamsForMemberData.length = 0;
  });

  // -------- header --------------------------------------------------------

  it('renders the person header: name, initials, and contact buttons', () => {
    renderDrawer();
    // Dialog aria-label is the full name.
    expect(screen.getByRole('dialog', { name: 'Alice Cohen' })).toBeInTheDocument();
    // The drawer head shows the first name + italic surname.
    const heading = screen.getByRole('heading', { level: 3, name: 'Alice Cohen' });
    expect(heading).toBeInTheDocument();
    // Initials live inside the Avatar in the drawer head.
    const head = heading.closest('.drawer-head') as HTMLElement;
    expect(within(head).getByText('AC')).toBeInTheDocument();
    // Head has one Call + one WhatsApp anchor (the Contact section adds a
    // second WhatsApp anchor, hence we scope to the head).
    expect(within(head).getByRole('link', { name: /Call Alice Cohen/i })).toBeInTheDocument();
    expect(within(head).getByRole('link', { name: /WhatsApp Alice Cohen/i })).toBeInTheDocument();
  });

  it('renders a COMMANDER chip in the head when the role on the viewed team is commander', () => {
    renderDrawer({ person: { teams: [{ team_id: 'team-1', role: 'commander' }] } });
    expect(screen.getByText('COMMANDER')).toBeInTheDocument();
  });

  it('does not render the COMMANDER chip when the viewed-team role is soldier', () => {
    renderDrawer({ person: { teams: [{ team_id: 'team-1', role: 'soldier' }] } });
    expect(screen.queryByText('COMMANDER')).not.toBeInTheDocument();
  });

  it('renders the StatusPill for the current status', () => {
    renderDrawer({ person: { status: 'standby', status_note: 'Returning at 18:00' } });
    expect(screen.getByText('Standby')).toBeInTheDocument();
    expect(screen.getByText('Returning at 18:00')).toBeInTheDocument();
  });

  // -------- contact: tel: / wa.me anchors --------------------------------

  it('renders tel: and https://wa.me/ anchors when phone normalizes', () => {
    renderDrawer({ person: { phone: '+972 52-000-0001' } });
    // normalizePhoneToE164IL('+972 52-000-0001') -> '972520000001'
    // The Call anchor is unique (only renders in the head).
    const callLink = screen.getByRole('link', { name: /Call Alice Cohen/i });
    expect(callLink).toHaveAttribute('href', 'tel:+972520000001');

    // WhatsApp anchor renders in BOTH the head (button row) and the Contact
    // section (action-btn). Verify both have the same href + target/rel.
    const waLinks = screen.getAllByRole('link', { name: /WhatsApp Alice Cohen/i });
    expect(waLinks).toHaveLength(2);
    for (const a of waLinks) {
      expect(a).toHaveAttribute('href', 'https://wa.me/972520000001');
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', expect.stringMatching(/noopener/));
    }
  });

  it('falls back to a toast (not an anchor) when phone fails to normalize', async () => {
    const user = userEvent.setup();
    // Empty phone fails the digit-length guard → e164 = null.
    const { onToast } = renderDrawer({ person: { phone: '' } });

    // No anchor versions present; Button fallback present.
    expect(screen.queryByRole('link', { name: /Call Alice Cohen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp Alice Cohen/i })).not.toBeInTheDocument();

    const callBtn = screen.getByRole('button', { name: /^Call$/i });
    await user.click(callBtn);
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Calling Alice Cohen/));

    const waBtn = screen.getByRole('button', { name: /^WhatsApp$/i });
    await user.click(waBtn);
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Opening WhatsApp with Alice Cohen/));
  });

  it('Copy-phone button writes the raw phone string to the clipboard', async () => {
    // happy-dom installs a real Clipboard EventTarget on the Navigator
    // prototype chain; spying on `writeText` on the live object is the
    // safest way to observe what the handler passes.
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockImplementation(async () => {});

    const user = userEvent.setup();
    const { onToast } = renderDrawer({ person: { phone: '+972 52-000-0001' } });

    try {
      const copyBtn = document.querySelector('button[data-tip="Copy"]') as HTMLButtonElement | null;
      expect(copyBtn).not.toBeNull();
      await user.click(copyBtn!);

      // The handler is `() => { navigator.clipboard?.writeText(person.phone); onToast('Phone copied'); }`.
      expect(writeTextSpy).toHaveBeenCalledWith('+972 52-000-0001');
      expect(onToast).toHaveBeenCalledWith('Phone copied');
    } finally {
      writeTextSpy.mockRestore();
    }
  });

  // -------- status edit --------------------------------------------------

  it('Override → pick "released" → Save calls useUpdateStatus with the right payload', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({ person: { status: 'available' } });

    // Enter edit mode.
    await user.click(screen.getByText('Override'));

    // Status buttons render a StatusPill labeled by STATUS_LABEL. The
    // four options are rendered inside <button>s; the "Released" pill is
    // unique enough to click.
    await user.click(screen.getByText('Released'));

    // Save commits.
    await user.click(screen.getByRole('button', { name: /Save/i }));

    expect(mockUpdateStatus.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockUpdateStatus.mutateAsync.mock.calls[0][0];
    expect(arg.memberId).toBe('m-alpha');
    expect(arg.status).toBe('released');
    expect(arg.note).toBeNull();
    expect(arg.until).toBeNull();
    expect(arg.setBy).toBe('commander-1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.memberName).toBe('Alice Cohen');
    expect(arg.teamId).toBe('team-1');

    expect(onToast).toHaveBeenCalledWith('Status set to Released');
  });

  // -------- skill editor -------------------------------------------------

  it('Edit Skills → add a skill calls useSetMemberSkill with intermediate', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      person: { skills: [] }, // start with no skills so all catalog entries are "missing"
      allSkills: ['Medic'],
    });

    await user.click(screen.getByText('Edit'));
    // Missing-skill chips render as `+ <name>`.
    await user.click(screen.getByRole('button', { name: /\+ Medic/ }));

    expect(mockSetSkill.mutate).toHaveBeenCalledTimes(1);
    const [payload, opts] = mockSetSkill.mutate.mock.calls[0];
    expect(payload).toMatchObject({
      memberId: 'm-alpha',
      divisionId: 'div-1',
      skillName: 'Medic',
      level: 'intermediate',
      actorId: 'commander-1',
      actorName: 'Commander Test',
      memberName: 'Alice Cohen',
      teamId: 'team-1',
    });
    // The handler passes an onSuccess that toasts; invoke it manually.
    opts.onSuccess?.();
    expect(onToast).toHaveBeenCalledWith('Medic → Intermediate');
  });

  it('Edit Skills → remove a held skill calls useRemoveMemberSkill', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      person: { skills: [{ name: 'Driving', level: 'senior' }] },
      allSkills: ['Driving'],
    });

    await user.click(screen.getByText('Edit'));
    // The held-skill row has an action-btn with title="Remove".
    const removeBtn = document.querySelector('button[title="Remove"]') as HTMLButtonElement | null;
    expect(removeBtn).not.toBeNull();
    await user.click(removeBtn!);

    expect(mockRemoveSkill.mutate).toHaveBeenCalledTimes(1);
    const [payload, opts] = mockRemoveSkill.mutate.mock.calls[0];
    expect(payload).toMatchObject({
      memberId: 'm-alpha',
      divisionId: 'div-1',
      skillName: 'Driving',
      actorId: 'commander-1',
      actorName: 'Commander Test',
      memberName: 'Alice Cohen',
      teamId: 'team-1',
    });
    opts.onSuccess?.();
    expect(onToast).toHaveBeenCalledWith('Removed Driving');
  });

  // -------- team membership ---------------------------------------------

  it('Promote soldier → commander calls useUpdateTeamMembership with role="commander"', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      person: { teams: [{ team_id: 'team-1', role: 'soldier' }] },
    });

    await user.click(screen.getByRole('button', { name: /Promote to commander/i }));

    expect(mockUpdateMembership.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockUpdateMembership.mutateAsync.mock.calls[0][0];
    expect(arg).toMatchObject({
      teamId: 'team-1',
      memberId: 'm-alpha',
      role: 'commander',
      actorId: 'commander-1',
      actorName: 'Commander Test',
      memberName: 'Alice Cohen',
    });
    expect(onToast).toHaveBeenCalledWith('Alice Cohen promoted to commander');
  });

  it('Remove-from-team → Confirm calls useRemoveTeamMembership with right payload', async () => {
    const user = userEvent.setup();
    const { onToast, onClose } = renderDrawer({
      // Put them on a non-viewed team so removing it does NOT close the drawer.
      team: { id: 'team-1', name: 'Alpha Team' },
      person: {
        teams: [
          { team_id: 'team-1', role: 'soldier' },
          { team_id: 'team-2', role: 'soldier' },
        ],
      },
    });

    // Two Remove buttons (one per membership card); click the first which
    // targets team-1 (the viewed team).
    const removeBtns = screen.getAllByRole('button', { name: /^Remove$/i });
    expect(removeBtns.length).toBeGreaterThan(0);
    await user.click(removeBtns[0]);

    // Confirm step appears.
    await user.click(screen.getByRole('button', { name: /Confirm/i }));

    expect(mockRemoveMembership.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockRemoveMembership.mutateAsync.mock.calls[0][0];
    expect(arg).toMatchObject({
      teamId: 'team-1',
      memberId: 'm-alpha',
      actorId: 'commander-1',
      actorName: 'Commander Test',
      memberName: 'Alice Cohen',
    });
    expect(onToast).toHaveBeenCalledWith('Alice Cohen removed from team');
    // Viewed-team removal closes the drawer.
    expect(onClose).toHaveBeenCalled();
  });

  // -------- delete member -----------------------------------------------

  it('Remove from division → Confirm remove calls useDeleteMember and closes', async () => {
    const user = userEvent.setup();
    const { onToast, onClose } = renderDrawer();

    // Click the outline "Remove Alice" button to open the confirm box.
    await user.click(screen.getByRole('button', { name: /Remove Alice/i }));
    // Then Confirm remove.
    await user.click(screen.getByRole('button', { name: /Confirm remove/i }));

    expect(mockDeleteMember.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockDeleteMember.mutateAsync.mock.calls[0][0];
    expect(arg).toMatchObject({
      memberId: 'm-alpha',
      memberName: 'Alice Cohen',
      actorId: 'commander-1',
      actorName: 'Commander Test',
      teamId: 'team-1',
    });
    expect(onToast).toHaveBeenCalledWith('Alice Cohen removed from division');
    expect(onClose).toHaveBeenCalled();
  });

  // -------- close --------------------------------------------------------

  it('Close button invokes onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ARIA tab pattern (profile / activity / reviews)
// ---------------------------------------------------------------------------

describe('PersonDrawer tab accessibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes a tablist with three tabs, profile selected by default', () => {
    renderDrawer();
    const tablist = screen.getByRole('tablist', { name: /sections/i });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['profile', 'activity', 'reviews']);

    const profileTab = screen.getByRole('tab', { name: /profile/i });
    expect(profileTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /activity/i })).toHaveAttribute('aria-selected', 'false');
    // Roving tabindex: only the selected tab is in the tab order.
    expect(profileTab).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /activity/i })).toHaveAttribute('tabindex', '-1');
  });

  it('associates the panel with the selected tab via aria-controls / aria-labelledby', () => {
    renderDrawer();
    const profileTab = screen.getByRole('tab', { name: /profile/i });
    const panel = screen.getByRole('tabpanel');
    expect(profileTab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', profileTab.id);
    expect(panel.id).toBe('pd-panel-profile');
  });

  it('never leaves a dangling aria-controls (only one panel is in the DOM)', () => {
    renderDrawer();
    // Only one tabpanel exists at a time; any tab that advertises
    // aria-controls must point at an element that actually exists.
    for (const tab of screen.getAllByRole('tab')) {
      const controlled = tab.getAttribute('aria-controls');
      if (controlled !== null) {
        expect(document.getElementById(controlled)).toBeInTheDocument();
      }
    }
    // Exactly one tab (the selected one) owns the live panel.
    const withControls = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-controls') !== null);
    expect(withControls).toHaveLength(1);
    expect(withControls[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a tab moves selection and re-labels the panel', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('tab', { name: /reviews/i }));

    const reviewsTab = screen.getByRole('tab', { name: /reviews/i });
    expect(reviewsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /profile/i })).toHaveAttribute('aria-selected', 'false');
    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe('pd-panel-reviews');
    expect(panel).toHaveAttribute('aria-labelledby', reviewsTab.id);
  });

  it('ArrowRight moves selection to the next tab (WAI-ARIA roving)', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const profileTab = screen.getByRole('tab', { name: /profile/i });
    profileTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: /activity/i })).toHaveAttribute('aria-selected', 'true');
    expect(profileTab).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowLeft from the first tab wraps to the last', async () => {
    const user = userEvent.setup();
    renderDrawer();
    screen.getByRole('tab', { name: /profile/i }).focus();
    await user.keyboard('{ArrowLeft}');

    expect(screen.getByRole('tab', { name: /reviews/i })).toHaveAttribute('aria-selected', 'true');
  });
});
