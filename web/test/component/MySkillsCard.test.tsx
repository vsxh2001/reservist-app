/**
 * MySkillsCard tests — view/edit mode, cycle/add/remove mutations.
 *
 * Mocks three hooks from lib/queries:
 *  - useSkills (returns the division-wide catalog)
 *  - useSetMemberSkill (cycle level + add)
 *  - useRemoveMemberSkill
 *
 * Follows the same vi.mock-factory pattern as MyStatusCard /
 * MyPhoneVisibilityCard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSet = { mutateAsync: vi.fn(), isPending: false };
const mockRemove = { mutateAsync: vi.fn(), isPending: false };
const mockSkillsRef: { data: string[] } = { data: ['Medic', 'Driver', 'Sniper'] };

vi.mock('../../src/lib/queries', () => ({
  useSkills: () => mockSkillsRef,
  useSetMemberSkill: () => mockSet,
  useRemoveMemberSkill: () => mockRemove,
}));

import { MySkillsCard } from '../../src/components/MySkillsCard';
import type { Member } from '../../src/lib/types';

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'me',
    division_id: 'div1',
    name: 'Alon Cohen',
    initials: 'AC',
    tone: 0,
    phone: '0541234567',
    joined: null,
    last_seen: null,
    calls_this_year: 0,
    status: 'available',
    status_note: null,
    status_until: null,
    status_set_at: new Date().toISOString(),
    is_division_admin: false,
    phone_visible_to_peers: true,
    skills: [],
    teams: [],
    ...overrides,
  } as unknown as Member;
}

describe('MySkillsCard', () => {
  beforeEach(() => {
    mockSet.mutateAsync.mockReset();
    mockSet.mutateAsync.mockResolvedValue(undefined);
    mockSet.isPending = false;
    mockRemove.mutateAsync.mockReset();
    mockRemove.mutateAsync.mockResolvedValue(undefined);
    mockRemove.isPending = false;
    mockSkillsRef.data = ['Medic', 'Driver', 'Sniper'];
  });

  it('view mode shows the empty-state hint when the member has no skills', () => {
    render(<MySkillsCard member={makeMember({ skills: [] })} userName="A" teamId="t1" onToast={() => {}} />);
    expect(screen.getByText(/No skills yet/)).toBeInTheDocument();
  });

  it('view mode lists chips for every skill the member has', () => {
    render(
      <MySkillsCard
        member={makeMember({ skills: [{ name: 'Medic', level: 'senior' }, { name: 'Driver', level: 'junior' }] })}
        userName="A" teamId="t1" onToast={() => {}}
      />,
    );
    expect(screen.getByText('Medic')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
  });

  it('toggling Edit replaces the chip view with editable rows', async () => {
    render(
      <MySkillsCard
        member={makeMember({ skills: [{ name: 'Medic', level: 'intermediate' }] })}
        userName="A" teamId="t1" onToast={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Medic/i })).toBeInTheDocument();
  });

  it('cycling a skill level posts mutateAsync with the next level in junior → intermediate → senior → junior', async () => {
    const onToast = vi.fn();
    render(
      <MySkillsCard
        member={makeMember({ skills: [{ name: 'Medic', level: 'junior' }] })}
        userName="Alon" teamId="t1" onToast={onToast}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    // The level button shows the current label (uppercased via CSS, but the
    // text node is still e.g. "junior" before transform).
    const levelButton = screen.getByRole('button', { name: /junior/i });
    await userEvent.click(levelButton);
    expect(mockSet.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockSet.mutateAsync.mock.calls[0][0]).toMatchObject({
      memberId: 'me',
      skillName: 'Medic',
      level: 'intermediate',
    });
    expect(onToast).toHaveBeenCalledWith('Medic: Intermediate');
  });

  it('removing a skill posts mutateAsync to useRemoveMemberSkill', async () => {
    const onToast = vi.fn();
    render(
      <MySkillsCard
        member={makeMember({ skills: [{ name: 'Driver', level: 'senior' }] })}
        userName="Alon" teamId="t1" onToast={onToast}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: /Remove Driver/i }));
    expect(mockRemove.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockRemove.mutateAsync.mock.calls[0][0]).toMatchObject({
      memberId: 'me',
      skillName: 'Driver',
    });
    expect(onToast).toHaveBeenCalledWith('Removed Driver');
  });

  it('hides the add-skill row when the member already has every catalog skill', async () => {
    mockSkillsRef.data = ['Medic'];
    render(
      <MySkillsCard
        member={makeMember({ skills: [{ name: 'Medic', level: 'junior' }] })}
        userName="A" teamId="t1" onToast={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText(/You already have every skill/)).toBeInTheDocument();
  });

  it('add flow posts mutateAsync with the selected skill + level and resets the form', async () => {
    const onToast = vi.fn();
    const { container } = render(
      <MySkillsCard member={makeMember()} userName="Alon" teamId="t1" onToast={onToast} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const selects = container.querySelectorAll('select');
    // First select: skill name. Second: level.
    fireEvent.change(selects[0], { target: { value: 'Sniper' } });
    fireEvent.change(selects[1], { target: { value: 'senior' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(mockSet.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockSet.mutateAsync.mock.calls[0][0]).toMatchObject({
      memberId: 'me',
      skillName: 'Sniper',
      level: 'senior',
    });
    expect(onToast).toHaveBeenCalledWith('Added Sniper: Senior');
  });

  it('Add button is disabled until a skill name is chosen', async () => {
    render(<MySkillsCard member={makeMember()} userName="A" teamId="t1" onToast={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('humanizes errors from cycle/add/remove into the toast', async () => {
    const onToast = vi.fn();
    mockRemove.mutateAsync.mockRejectedValueOnce(new Error('boom'));
    render(
      <MySkillsCard
        member={makeMember({ skills: [{ name: 'Driver', level: 'junior' }] })}
        userName="A" teamId="t1" onToast={onToast}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: /Remove Driver/i }));
    expect(onToast).toHaveBeenCalledWith('Failed to remove skill: boom');
  });

  it('cycle and remove buttons honor isPending', async () => {
    mockSet.isPending = true;
    mockRemove.isPending = true;
    render(
      <MySkillsCard
        member={makeMember({ skills: [{ name: 'Medic', level: 'junior' }] })}
        userName="A" teamId="t1" onToast={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: /junior/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Remove Medic/i })).toBeDisabled();
  });
});
