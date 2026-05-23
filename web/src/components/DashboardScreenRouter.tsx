/**
 * DashboardScreenRouter — switches on the commander dashboard's `active`
 * screen and renders the matching screen component with the data + callbacks
 * it needs.
 *
 * Pure presentational: the parent owns the active state, the queries, and
 * every dispatcher callback. Lifting this into its own component trims
 * ~60 LOC of switch-rendering from Dashboard.tsx without changing semantics.
 */

import type { UseQueryResult } from '@tanstack/react-query';
import { Roster } from './Roster';
import { SlotsScreen } from './SlotsScreen';
import { ActivityScreen } from './ActivityScreen';
import { SettingsScreen } from './SettingsScreen';
import { RequestsScreen } from './RequestsScreen';
import { CalendarScreen } from './CalendarScreen';
import { CommanderDayView } from './CommanderDayView';
import { DivisionAdminScreen } from './DivisionAdminScreen';
import type {
  ActivityItem, Division, Filters, Member, Screen, Slot, Team,
} from '../lib/types';

interface Props {
  active: Screen;
  team: Team;
  members: UseQueryResult<Member[]>;
  skills: UseQueryResult<string[]>;
  slots: UseQueryResult<Slot[]>;
  activity: UseQueryResult<ActivityItem[]>;
  division: UseQueryResult<Division | null>;
  filters: Filters;
  onFilters: (f: Filters) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
  onPerson: (m: Member) => void;
  onSlotDrawer: (s: Slot) => void;
  onModalOpen: (vars: { urgent: boolean; preselected: string | null }) => void;
  onSetActive: (s: Screen) => void;
  setTeamId: (id: string) => void;
  onSettingsRefresh: () => void;
  onToast: (msg: string) => void;
}

export function DashboardScreenRouter({
  active,
  team,
  members,
  skills,
  slots,
  activity,
  division,
  filters,
  onFilters,
  selected,
  setSelected,
  onPerson,
  onSlotDrawer,
  onModalOpen,
  onSetActive,
  setTeamId,
  onSettingsRefresh,
  onToast,
}: Props) {
  return (
    <div className="scroll">
      {active === 'roster' && (
        members.isLoading || skills.isLoading
          ? <div style={{ padding: 40, color: 'var(--ink-soft)' }}>Loading roster…</div>
          : members.error
            ? <div style={{ padding: 40, color: 'var(--st-unav)' }}>Failed: {(members.error as Error).message}</div>
            : (
              <Roster
                members={members.data ?? []}
                skills={skills.data ?? []}
                slots={slots.data ?? []}
                teamId={team.id}
                filters={filters}
                onFilters={onFilters}
                selected={selected}
                setSelected={setSelected}
                onPerson={onPerson}
                onToast={onToast}
                onNewSlotWith={(memberId) => onModalOpen({ urgent: false, preselected: memberId })}
              />
            )
      )}
      {active === 'slots' && (
        <SlotsScreen
          slots={slots.data ?? []}
          members={members.data ?? []}
          onUrgent={() => onModalOpen({ urgent: true, preselected: null })}
          onNewSlot={() => onModalOpen({ urgent: false, preselected: null })}
          onSlotClick={onSlotDrawer}
          onToast={onToast}
        />
      )}
      {active === 'activity' && <ActivityScreen items={activity.data ?? []} />}
      {active === 'settings' && (
        <SettingsScreen
          team={team}
          divisionId={division.data?.id ?? ''}
          skills={skills.data ?? []}
          onToast={onToast}
          onRefresh={onSettingsRefresh}
        />
      )}
      {active === 'requests' && (
        <RequestsScreen team={team} onToast={onToast} />
      )}
      {active === 'calendar' && (
        <CalendarScreen
          slots={slots.data ?? []}
          members={members.data ?? []}
          onSlotClick={onSlotDrawer}
        />
      )}
      {active === 'day' && (
        <CommanderDayView teamId={team.id} />
      )}
      {active === 'admin' && (
        <DivisionAdminScreen
          onOpenTeam={(id) => { setTeamId(id); onSetActive('roster'); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}
