/**
 * DashboardOverlays — the three top-level overlays that float above the
 * commander dashboard's scrollable content: PersonDrawer, SlotDrawer, and
 * the NewSlotModal.
 *
 * Pure presentational. The parent owns `person`, `slotDrawer`, and `modal`
 * state and dispatches the close/clone/open callbacks. Bundling them here
 * keeps Dashboard.tsx free of ~30 LOC of overlay-only JSX.
 */

import { PersonDrawer } from './PersonDrawer';
import { SlotDrawer } from './SlotDrawer';
import { NewSlotModal } from './NewSlotModal';
import type { Member, Slot, Team } from '../lib/types';

type ModalState = {
  open: boolean;
  urgent: boolean;
  preselected: string | null;
  cloneFrom?: Slot | null;
};

interface Props {
  team: Team;
  divisionId: string;
  members: Member[];
  slots: Slot[];
  skills: string[];
  approvedPicks: { member_id: string; date: string }[];
  person: Member | null;
  onClosePerson: () => void;
  slotDrawer: Slot | null;
  onCloseSlot: () => void;
  onCloneSlot: (s: Slot) => void;
  modal: ModalState;
  onCloseModal: () => void;
  onToast: (msg: string) => void;
}

export function DashboardOverlays({
  team,
  divisionId,
  members,
  slots,
  skills,
  approvedPicks,
  person,
  onClosePerson,
  slotDrawer,
  onCloseSlot,
  onCloneSlot,
  modal,
  onCloseModal,
  onToast,
}: Props) {
  return (
    <>
      {person && (
        <PersonDrawer
          person={person}
          team={team}
          allSkills={skills}
          divisionId={divisionId}
          onClose={onClosePerson}
          onToast={onToast}
        />
      )}

      {slotDrawer && (
        <SlotDrawer
          slot={slotDrawer}
          members={members}
          allSlots={slots}
          approvedPicks={approvedPicks}
          teamId={team.id}
          onClose={onCloseSlot}
          onClone={onCloneSlot}
          onToast={onToast}
        />
      )}

      <NewSlotModal
        open={modal.open}
        urgent={modal.urgent}
        members={members}
        slots={slots}
        approvedPicks={approvedPicks}
        teamId={team.id}
        preselected={modal.preselected}
        cloneFrom={modal.cloneFrom ?? null}
        onClose={onCloseModal}
        onToast={onToast}
      />
    </>
  );
}
