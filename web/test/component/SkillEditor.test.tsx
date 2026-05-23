/**
 * SkillEditor tests — extracted from PersonDrawer.tsx in this PR.
 *
 * Pure presentational: parent owns the held list, catalog, busy flag, and
 * dispatchers. Tests pin the held/missing render split and the click
 * contracts.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillEditor } from '../../src/components/SkillEditor';
import type { SkillLevel } from '../../src/lib/types';

function makeProps(overrides: Partial<React.ComponentProps<typeof SkillEditor>> = {}): React.ComponentProps<typeof SkillEditor> {
  return {
    held: [{ name: 'Medic', level: 'senior' }],
    catalog: ['Medic', 'Driver', 'Sniper'],
    busy: false,
    onSet: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}

describe('SkillEditor', () => {
  it('renders one row per held skill', () => {
    render(<SkillEditor {...makeProps({ held: [
      { name: 'Medic', level: 'senior' },
      { name: 'Driver', level: 'junior' },
    ] })} />);
    expect(screen.getByText('Medic')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
  });

  it('lists missing catalog skills as "+ Name" buttons', () => {
    render(<SkillEditor {...makeProps({ held: [{ name: 'Medic', level: 'senior' }] })} />);
    expect(screen.getByRole('button', { name: '+ Driver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Sniper' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Medic' })).not.toBeInTheDocument();
  });

  it('hides the "Add skill" section when the catalog is fully held', () => {
    render(<SkillEditor {...makeProps({
      held: [
        { name: 'Medic', level: 'senior' },
        { name: 'Driver', level: 'junior' },
        { name: 'Sniper', level: 'intermediate' },
      ],
      catalog: ['Medic', 'Driver', 'Sniper'],
    })} />);
    expect(screen.queryByText('Add skill')).not.toBeInTheDocument();
  });

  it('marks the current level button with data-on="1" and others with "0"', () => {
    render(<SkillEditor {...makeProps({ held: [{ name: 'Medic', level: 'intermediate' }] })} />);
    const row = screen.getByText('Medic').parentElement!;
    const buttons = within(row).getAllByRole('button');
    const intermediate = buttons.find((b) => b.textContent === 'Intermediate');
    const senior = buttons.find((b) => b.textContent === 'Senior');
    expect(intermediate).toHaveAttribute('data-on', '1');
    expect(senior).toHaveAttribute('data-on', '0');
  });

  it('clicking a different level fires onSet(name, level)', async () => {
    const onSet = vi.fn();
    render(<SkillEditor {...makeProps({ onSet, held: [{ name: 'Medic', level: 'junior' }] })} />);
    const row = screen.getByText('Medic').parentElement!;
    const senior = within(row).getByRole('button', { name: 'Senior' });
    await userEvent.click(senior);
    expect(onSet).toHaveBeenCalledWith('Medic', 'senior');
  });

  it('clicking the same level is a no-op (does not fire onSet)', async () => {
    const onSet = vi.fn();
    render(<SkillEditor {...makeProps({ onSet, held: [{ name: 'Medic', level: 'senior' }] })} />);
    const row = screen.getByText('Medic').parentElement!;
    const senior = within(row).getByRole('button', { name: 'Senior' });
    await userEvent.click(senior);
    expect(onSet).not.toHaveBeenCalled();
  });

  it('clicking the X removes the held skill via onRemove', async () => {
    const onRemove = vi.fn();
    render(<SkillEditor {...makeProps({ onRemove })} />);
    await userEvent.click(screen.getByLabelText('Remove Medic'));
    expect(onRemove).toHaveBeenCalledWith('Medic');
  });

  it('clicking a missing-skill button adds it at the intermediate default', async () => {
    const onSet = vi.fn();
    render(<SkillEditor {...makeProps({ onSet, held: [] })} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Driver' }));
    expect(onSet).toHaveBeenCalledWith('Driver', 'intermediate' as SkillLevel);
  });

  it('busy=true disables every interactive button', () => {
    render(<SkillEditor {...makeProps({ busy: true, held: [{ name: 'Medic', level: 'junior' }] })} />);
    const row = screen.getByText('Medic').parentElement!;
    within(row).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    expect(screen.getByRole('button', { name: '+ Driver' })).toBeDisabled();
  });
});
