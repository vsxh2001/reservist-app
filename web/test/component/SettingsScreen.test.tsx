/**
 * SettingsScreen component tests.
 *
 * SettingsScreen renders six sections (Team / Invite link / Skill tags /
 * Display / Reservist visibility / Notifications / Privacy) and wires up:
 *   - supabase.from('teams').update(...) for regenerate + renew
 *   - useAddSkill / useDeleteSkill / useSetTeamShowUnitSchedule mutations
 *   - usePrefs.setDir / setLang for the LTR/RTL toggle
 *   - subscribeToPush / unsubscribeFromPush / currentSubscription / sendTestPush
 *     from lib/push
 *
 * We mock supabase, the queries hooks, usePrefs, useAuth, and lib/push so the
 * component can mount without a real backend or a service worker.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Team } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// ── supabase: only `from('teams').update({...}).eq('id', ...)` is used ─────
let teamsUpdateResult: { error: { message: string } | null } = { error: null };
const updateSpy = vi.fn();
const eqSpy = vi.fn();

function makeTeamsBuilder() {
  const builder: Record<string, unknown> = {};
  builder.update = (payload: Record<string, unknown>) => {
    updateSpy(payload);
    return builder;
  };
  builder.eq = (col: string, val: string) => {
    eqSpy(col, val);
    return Promise.resolve(teamsUpdateResult);
  };
  return builder;
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'teams') return makeTeamsBuilder();
      throw new Error(`Unexpected table in SettingsScreen test: ${table}`);
    },
  },
}));

// ── queries hooks ──────────────────────────────────────────────────────────
const addSkillMutateAsync = vi.fn();
const delSkillMutateAsync = vi.fn();
const setShowUnitScheduleMutateAsync = vi.fn();
let setShowUnitSchedulePending = false;
let addSkillPending = false;

vi.mock('../../src/lib/queries', () => ({
  useAddSkill: () => ({
    mutateAsync: addSkillMutateAsync,
    isPending: addSkillPending,
  }),
  useDeleteSkill: () => ({
    mutateAsync: delSkillMutateAsync,
    isPending: false,
  }),
  useSetTeamShowUnitSchedule: () => ({
    mutateAsync: setShowUnitScheduleMutateAsync,
    isPending: setShowUnitSchedulePending,
  }),
}));

// ── prefs ──────────────────────────────────────────────────────────────────
const setDirMock = vi.fn();
const setLangMock = vi.fn();
let prefsDir: 'ltr' | 'rtl' = 'ltr';

vi.mock('../../src/lib/prefs', () => ({
  usePrefs: () => ({
    dir: prefsDir,
    lang: prefsDir === 'ltr' ? 'en' : 'he',
    setDir: setDirMock,
    setLang: setLangMock,
  }),
}));

// ── auth ───────────────────────────────────────────────────────────────────
vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'member-1', name: 'Commander Test' },
    authUser: null,
    status: 'linked',
  }),
}));

// ── lib/push ───────────────────────────────────────────────────────────────
const subscribeToPushMock = vi.fn();
const unsubscribeFromPushMock = vi.fn();
const sendTestPushMock = vi.fn();
let currentSubscriptionResult: PushSubscription | null = null;
const currentSubscriptionMock = vi.fn(async () => currentSubscriptionResult);

vi.mock('../../src/lib/push', () => ({
  subscribeToPush: (id: string) => subscribeToPushMock(id),
  unsubscribeFromPush: (id: string) => unsubscribeFromPushMock(id),
  currentSubscription: () => currentSubscriptionMock(),
  sendTestPush: () => sendTestPushMock(),
}));

import { SettingsScreen } from '../../src/components/SettingsScreen';

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
    invite_code: 'alpha-001',
    // 5 days in the future — safely unexpired.
    invite_expires_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    established: '2024-01',
    member_count: 12,
    commander_count: 2,
    project_name: 'Reservist Pilot',
    show_unit_schedule: false,
    ...overrides,
  };
}

function renderSettings(team: Team = makeTeam(), skills: string[] = ['Medic', 'Driver']) {
  const onToast = vi.fn();
  const onRefresh = vi.fn();
  const utils = render(
    <SettingsScreen
      team={team}
      divisionId="div-1"
      skills={skills}
      onToast={onToast}
      onRefresh={onRefresh}
    />,
  );
  return { ...utils, onToast, onRefresh };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsScreen', () => {
  beforeEach(() => {
    updateSpy.mockReset();
    eqSpy.mockReset();
    addSkillMutateAsync.mockReset();
    delSkillMutateAsync.mockReset();
    setShowUnitScheduleMutateAsync.mockReset();
    setDirMock.mockReset();
    setLangMock.mockReset();
    subscribeToPushMock.mockReset();
    unsubscribeFromPushMock.mockReset();
    sendTestPushMock.mockReset();
    currentSubscriptionMock.mockClear();
    teamsUpdateResult = { error: null };
    prefsDir = 'ltr';
    currentSubscriptionResult = null;
    setShowUnitSchedulePending = false;
    addSkillPending = false;
    // window.location.origin is provided by happy-dom; clipboard set per-test.
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all sections with seeded team data', async () => {
    renderSettings();

    // Section headers
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Invite link')).toBeInTheDocument();
    expect(screen.getByText(/Skill tags \(2\) · division-wide/)).toBeInTheDocument();
    expect(screen.getByText('Display')).toBeInTheDocument();
    expect(screen.getByText('Reservist visibility')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Privacy')).toBeInTheDocument();

    // Team facts
    expect(screen.getByText('Alpha Company')).toBeInTheDocument();
    expect(screen.getByText('Reservist Pilot')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // member_count
    expect(screen.getByText('2')).toBeInTheDocument();  // commander_count

    // Skills are rendered
    expect(screen.getByText('Medic')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();

    // Notifications section starts in "loading" while currentSubscription resolves.
    // Wait for the resolved (null → "Enable push") branch.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Enable push/i })).toBeInTheDocument();
    });
  });

  it('renders the invite link and Copy button writes the link to the clipboard', async () => {
    const writeTextMock = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    const { onToast } = renderSettings();

    const expectedLink = `${window.location.origin}/join/alpha-001`;
    expect(screen.getByText(expectedLink)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Copy$/i }));
    expect(writeTextMock).toHaveBeenCalledWith(expectedLink);
    expect(onToast).toHaveBeenCalledWith('Invite link copied');
  });

  it('Regenerate updates invite_code via supabase and toasts on success', async () => {
    const { onToast, onRefresh } = renderSettings();

    await userEvent.click(screen.getByRole('button', { name: /Regenerate/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const payload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toHaveProperty('invite_code');
    expect(typeof payload.invite_code).toBe('string');
    expect(payload).toHaveProperty('invite_expires_at');
    expect(eqSpy).toHaveBeenCalledWith('id', 'team-1');

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('New invite link generated (valid 7 days)');
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('Add-skill submits via useAddSkill with { divisionId, name }', async () => {
    addSkillMutateAsync.mockResolvedValue(undefined);
    const { onToast } = renderSettings();

    const input = screen.getByPlaceholderText(/New skill tag/i);
    await userEvent.type(input, '  Sniper  ');
    await userEvent.click(screen.getByRole('button', { name: /Add skill/i }));

    await waitFor(() => {
      expect(addSkillMutateAsync).toHaveBeenCalledWith({
        divisionId: 'div-1',
        name: 'Sniper',
      });
    });
    expect(onToast).toHaveBeenCalledWith('Skill "Sniper" added');
  });

  it('Remove-skill submits via useDeleteSkill', async () => {
    delSkillMutateAsync.mockResolvedValue(undefined);
    const { onToast } = renderSettings();

    // Each EditableTag renders a hidden remove button with title="Remove".
    const removeBtns = screen.getAllByTitle('Remove');
    expect(removeBtns).toHaveLength(2);

    // Click the remove next to "Medic" (first tag).
    await userEvent.click(removeBtns[0]);

    await waitFor(() => {
      expect(delSkillMutateAsync).toHaveBeenCalledWith({
        divisionId: 'div-1',
        name: 'Medic',
      });
    });
    expect(onToast).toHaveBeenCalledWith('Skill "Medic" removed');
  });

  it('LTR / RTL buttons call prefs.setDir and prefs.setLang', async () => {
    renderSettings();

    await userEvent.click(screen.getByRole('button', { name: /RTL/i }));
    expect(setDirMock).toHaveBeenCalledWith('rtl');
    expect(setLangMock).toHaveBeenCalledWith('he');

    await userEvent.click(screen.getByRole('button', { name: /LTR/i }));
    expect(setDirMock).toHaveBeenCalledWith('ltr');
    expect(setLangMock).toHaveBeenCalledWith('en');
  });

  it('Reservist-visibility On toggle calls useSetTeamShowUnitSchedule with true', async () => {
    setShowUnitScheduleMutateAsync.mockResolvedValue(undefined);
    // Team starts with show_unit_schedule: false, so toggling On should fire.
    const { onToast, onRefresh } = renderSettings();

    await userEvent.click(screen.getByRole('button', { name: /^On$/ }));

    await waitFor(() => {
      expect(setShowUnitScheduleMutateAsync).toHaveBeenCalledWith({
        teamId: 'team-1',
        value: true,
      });
    });
    expect(onRefresh).toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('Reservists now see all team slots');
  });

  it('Reservist-visibility Off toggle calls useSetTeamShowUnitSchedule with false', async () => {
    setShowUnitScheduleMutateAsync.mockResolvedValue(undefined);
    // Start with show_unit_schedule: true so flipping Off triggers the mutation.
    const { onToast } = renderSettings(makeTeam({ show_unit_schedule: true }));

    await userEvent.click(screen.getByRole('button', { name: /^Off$/ }));

    await waitFor(() => {
      expect(setShowUnitScheduleMutateAsync).toHaveBeenCalledWith({
        teamId: 'team-1',
        value: false,
      });
    });
    expect(onToast).toHaveBeenCalledWith('Reservists now only see their own slots');
  });

  it('Push enable button calls subscribeToPush with the current user id', async () => {
    subscribeToPushMock.mockResolvedValue({ ok: true });
    // Once enabled, currentSubscription() is re-read and returns a fake sub.
    currentSubscriptionResult = null;

    const { onToast } = renderSettings();

    const enableBtn = await screen.findByRole('button', { name: /Enable push/i });

    // Flip the subscription so the second currentSubscription() call returns one.
    currentSubscriptionResult = { fake: true } as unknown as PushSubscription;
    await userEvent.click(enableBtn);

    await waitFor(() => {
      expect(subscribeToPushMock).toHaveBeenCalledWith('member-1');
    });
    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('Push notifications enabled');
    });
  });

  it('shows "Expired" badge when invite_expires_at is in the past', async () => {
    renderSettings(
      makeTeam({
        invite_expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    expect(screen.getByText(/Expired — regenerate to issue a new link/i)).toBeInTheDocument();
  });

  it('Renew button bumps expiry via supabase update', async () => {
    const { onToast, onRefresh } = renderSettings();

    await userEvent.click(screen.getByRole('button', { name: /Renew/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const payload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toHaveProperty('invite_expires_at');
    // Renew should NOT rotate the invite_code.
    expect(payload).not.toHaveProperty('invite_code');
    // And the new expiry should be in the future.
    const nextExpiry = Date.parse(payload.invite_expires_at as string);
    expect(nextExpiry).toBeGreaterThan(Date.now());

    expect(eqSpy).toHaveBeenCalledWith('id', 'team-1');
    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('Invite extended by 7 days');
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
