/**
 * DashboardOverlays tests — the three top-level overlays that float above
 * the commander dashboard (PersonDrawer, SlotDrawer, NewSlotModal).
 *
 * The component itself is render-when-truthy + prop-passthrough. Each
 * overlay is mocked to a marker that captures its props so we can pin:
 *
 *   - PersonDrawer only mounts when `person` is non-null
 *   - SlotDrawer  only mounts when `slotDrawer` is non-null
 *   - NewSlotModal always mounts; `open` mirrors `modal.open`
 *   - `cloneFrom={modal.cloneFrom ?? null}` — undefined coerces to null,
 *     so a stale optional from the parent never reaches the modal
 *   - `teamId` is sourced from `team.id` for both SlotDrawer and NewSlotModal
 *   - Callback wiring (onClose / onClone / onToast) is passed through
 *
 * Pinning the small hinge before the deferred PRD §9 confirm/decline
 * assignment flow lands another overlay through here.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const captured: Record<string, unknown[]> = {};
function capture(name: string) {
  return (props: Record<string, unknown>) => {
    (captured[name] ??= []).push(props);
    return <div data-testid={`overlay-${name.toLowerCase()}`} />;
  };
}

vi.mock('../../src/components/PersonDrawer', () => ({ PersonDrawer: capture('PersonDrawer') }));
vi.mock('../../src/components/SlotDrawer',   () => ({ SlotDrawer:   capture('SlotDrawer')   }));
vi.mock('../../src/components/NewSlotModal', () => ({ NewSlotModal: capture('NewSlotModal') }));

import { DashboardOverlays } from '../../src/components/DashboardOverlays';
import type { Member, Slot, Team } from '../../src/lib/types';

function makeTeam(): Team {
  return {
    id: 'team-1',
    project_id: 'proj-1',
    division_id: 'div-1',
    name: 'Alpha',
    crest: '🦊',
    invite_code: null,
    invite_expires_at: null,
    established: null,
    member_count: 1,
    commander_count: 1,
    project_name: 'Recon',
    show_unit_schedule: true,
  };
}

function makeMember(id = 'mem-1'): Member {
  return {
    id,
    division_id: 'div-1',
    name: 'Dana',
    initials: 'D',
    tone: 1,
    phone: '+972500000000',
    joined: null,
    last_seen: null,
    calls_this_year: 0,
    status: 'available',
    status_note: null,
    status_until: null,
    status_set_at: '2026-01-01T00:00:00Z',
    is_division_admin: false,
    phone_visible_to_peers: true,
    skills: [],
    teams: [{ team_id: 'team-1', role: 'soldier' }],
  };
}

function makeSlot(id = 'slot-1'): Slot {
  return {
    id,
    team_id: 'team-1',
    title: 'Gate watch',
    urgent: false,
    state: 'published',
    start_at: '2026-06-01T08:00:00Z',
    end_at: '2026-06-01T16:00:00Z',
    duration: '8h',
    location: 'North gate',
    notes: null,
    assignee_id: null,
  };
}

type Props = Parameters<typeof DashboardOverlays>[0];

function makeProps(overrides: Partial<Props> = {}): Props {
  const team = makeTeam();
  return {
    team,
    divisionId: 'div-1',
    members: [],
    slots: [],
    skills: [],
    approvedPicks: [],
    person: null,
    onClosePerson: vi.fn(),
    slotDrawer: null,
    onCloseSlot: vi.fn(),
    onCloneSlot: vi.fn(),
    modal: { open: false, urgent: false, preselected: null },
    onCloseModal: vi.fn(),
    onToast: vi.fn(),
    ...overrides,
  };
}

function resetCaptured() {
  for (const k of Object.keys(captured)) captured[k] = [];
}

describe('DashboardOverlays', () => {
  describe('PersonDrawer', () => {
    it('does not render when person is null', () => {
      resetCaptured();
      render(<DashboardOverlays {...makeProps({ person: null })} />);
      expect(screen.queryByTestId('overlay-persondrawer')).not.toBeInTheDocument();
      expect(captured.PersonDrawer ?? []).toHaveLength(0);
    });

    it('renders when person is non-null and forwards person/team/divisionId/onClose/onToast', () => {
      resetCaptured();
      const person = makeMember('mem-42');
      const onClosePerson = vi.fn();
      const onToast = vi.fn();
      render(
        <DashboardOverlays
          {...makeProps({
            person,
            onClosePerson,
            skills: ['medic', 'driver'],
            onToast,
          })}
        />,
      );
      expect(screen.getByTestId('overlay-persondrawer')).toBeInTheDocument();
      const props = captured.PersonDrawer[0] as {
        person: Member;
        team: Team;
        allSkills: string[];
        divisionId: string;
        onClose: () => void;
        onToast: (msg: string) => void;
      };
      expect(props.person).toBe(person);
      expect(props.team.id).toBe('team-1');
      expect(props.allSkills).toEqual(['medic', 'driver']);
      expect(props.divisionId).toBe('div-1');
      expect(props.onClose).toBe(onClosePerson);
      expect(props.onToast).toBe(onToast);
    });
  });

  describe('SlotDrawer', () => {
    it('does not render when slotDrawer is null', () => {
      resetCaptured();
      render(<DashboardOverlays {...makeProps({ slotDrawer: null })} />);
      expect(screen.queryByTestId('overlay-slotdrawer')).not.toBeInTheDocument();
      expect(captured.SlotDrawer ?? []).toHaveLength(0);
    });

    it('renders when slotDrawer is non-null and forwards slot/members/allSlots/approvedPicks/teamId/onClose/onClone/onToast', () => {
      resetCaptured();
      const slot = makeSlot('slot-7');
      const members = [makeMember('mem-1'), makeMember('mem-2')];
      const slots = [slot, makeSlot('slot-8')];
      const approvedPicks = [{ member_id: 'mem-1', date: '2026-06-01' }];
      const onCloseSlot = vi.fn();
      const onCloneSlot = vi.fn();
      const onToast = vi.fn();
      render(
        <DashboardOverlays
          {...makeProps({
            slotDrawer: slot,
            members,
            slots,
            approvedPicks,
            onCloseSlot,
            onCloneSlot,
            onToast,
          })}
        />,
      );
      const props = captured.SlotDrawer[0] as {
        slot: Slot;
        members: Member[];
        allSlots: Slot[];
        approvedPicks: { member_id: string; date: string }[];
        teamId: string;
        onClose: () => void;
        onClone: (s: Slot) => void;
        onToast: (msg: string) => void;
      };
      expect(props.slot).toBe(slot);
      expect(props.members).toBe(members);
      expect(props.allSlots).toBe(slots);
      expect(props.approvedPicks).toBe(approvedPicks);
      expect(props.teamId).toBe('team-1');
      expect(props.onClose).toBe(onCloseSlot);
      expect(props.onClone).toBe(onCloneSlot);
      expect(props.onToast).toBe(onToast);
    });
  });

  describe('NewSlotModal', () => {
    it('always renders (mount lifecycle owns its own open/closed state)', () => {
      resetCaptured();
      render(<DashboardOverlays {...makeProps({ modal: { open: false, urgent: false, preselected: null } })} />);
      expect(screen.getByTestId('overlay-newslotmodal')).toBeInTheDocument();
      expect(captured.NewSlotModal).toHaveLength(1);
    });

    it('forwards open/urgent/preselected from the modal state', () => {
      resetCaptured();
      render(
        <DashboardOverlays
          {...makeProps({
            modal: { open: true, urgent: true, preselected: 'mem-99' },
          })}
        />,
      );
      const props = captured.NewSlotModal[0] as {
        open: boolean;
        urgent: boolean;
        preselected: string | null;
      };
      expect(props.open).toBe(true);
      expect(props.urgent).toBe(true);
      expect(props.preselected).toBe('mem-99');
    });

    it('coerces an undefined cloneFrom to null', () => {
      // The component spreads `cloneFrom={modal.cloneFrom ?? null}` so the
      // modal never receives `undefined`. Pin that contract since the modal
      // is typed `Slot | null` (not optional).
      resetCaptured();
      render(<DashboardOverlays {...makeProps({ modal: { open: false, urgent: false, preselected: null } })} />);
      const props = captured.NewSlotModal[0] as { cloneFrom: Slot | null };
      expect(props.cloneFrom).toBeNull();
    });

    it('forwards a provided cloneFrom slot through verbatim', () => {
      resetCaptured();
      const cloneFrom = makeSlot('slot-clone');
      render(
        <DashboardOverlays
          {...makeProps({
            modal: { open: true, urgent: false, preselected: null, cloneFrom },
          })}
        />,
      );
      const props = captured.NewSlotModal[0] as { cloneFrom: Slot | null };
      expect(props.cloneFrom).toBe(cloneFrom);
    });

    it('coerces an explicitly-null cloneFrom to null (no double-wrap)', () => {
      resetCaptured();
      render(
        <DashboardOverlays
          {...makeProps({
            modal: { open: false, urgent: false, preselected: null, cloneFrom: null },
          })}
        />,
      );
      const props = captured.NewSlotModal[0] as { cloneFrom: Slot | null };
      expect(props.cloneFrom).toBeNull();
    });

    it('forwards teamId from team.id and the onClose/onToast callbacks', () => {
      resetCaptured();
      const onCloseModal = vi.fn();
      const onToast = vi.fn();
      const members = [makeMember()];
      const slots = [makeSlot()];
      const approvedPicks = [{ member_id: 'mem-1', date: '2026-06-02' }];
      render(
        <DashboardOverlays
          {...makeProps({
            members,
            slots,
            approvedPicks,
            modal: { open: true, urgent: false, preselected: null },
            onCloseModal,
            onToast,
          })}
        />,
      );
      const props = captured.NewSlotModal[0] as {
        teamId: string;
        members: Member[];
        slots: Slot[];
        approvedPicks: { member_id: string; date: string }[];
        onClose: () => void;
        onToast: (msg: string) => void;
      };
      expect(props.teamId).toBe('team-1');
      expect(props.members).toBe(members);
      expect(props.slots).toBe(slots);
      expect(props.approvedPicks).toBe(approvedPicks);
      expect(props.onClose).toBe(onCloseModal);
      expect(props.onToast).toBe(onToast);
    });
  });

  it('renders all three overlays simultaneously when person and slotDrawer are both set', () => {
    resetCaptured();
    render(
      <DashboardOverlays
        {...makeProps({
          person: makeMember(),
          slotDrawer: makeSlot(),
          modal: { open: true, urgent: false, preselected: null },
        })}
      />,
    );
    expect(screen.getByTestId('overlay-persondrawer')).toBeInTheDocument();
    expect(screen.getByTestId('overlay-slotdrawer')).toBeInTheDocument();
    expect(screen.getByTestId('overlay-newslotmodal')).toBeInTheDocument();
  });
});
