/**
 * SkillFilterBuilder tests — extracted from Roster.tsx in this PR.
 *
 * Pure presentational: parent owns `value` + `onChange`. Tests pin the
 * "available options exclude already-picked", "Add disables until skill
 * chosen", "Remove removes by name" contracts.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillFilterBuilder } from '../../src/components/SkillFilterBuilder';
import type { SkillFilter } from '../../src/lib/types';

function makeProps(overrides: Partial<React.ComponentProps<typeof SkillFilterBuilder>> = {}): React.ComponentProps<typeof SkillFilterBuilder> {
  return {
    options: ['Medic', 'Driver', 'Sniper'],
    value: [],
    onChange: vi.fn(),
    ...overrides,
  };
}

describe('SkillFilterBuilder', () => {
  it('shows every catalog option in the skill select when value is empty', () => {
    const { container } = render(<SkillFilterBuilder {...makeProps()} />);
    const skillSelect = container.querySelectorAll('select')[0];
    const options = Array.from(skillSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Skill…', 'Medic', 'Driver', 'Sniper']);
  });

  it('hides already-picked skills from the skill select', () => {
    const value: SkillFilter[] = [{ name: 'Medic', min_level: 'junior' }];
    const { container } = render(<SkillFilterBuilder {...makeProps({ value })} />);
    const skillSelect = container.querySelectorAll('select')[0];
    const options = Array.from(skillSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).not.toContain('Medic');
    expect(options).toContain('Driver');
    expect(options).toContain('Sniper');
  });

  it('renders one chip per picked filter', () => {
    const value: SkillFilter[] = [
      { name: 'Medic', min_level: 'senior' },
      { name: 'Driver', min_level: 'intermediate' },
    ];
    render(<SkillFilterBuilder {...makeProps({ value })} />);
    // SkillChip uses min_level form which shows "≥" prefix.
    expect(screen.getByText('Medic')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
  });

  it('Add button is disabled until a skill name is chosen', () => {
    render(<SkillFilterBuilder {...makeProps()} />);
    expect(screen.getByLabelText('Add skill requirement')).toBeDisabled();
  });

  it('Add fires onChange with the new {name, min_level} appended', async () => {
    const onChange = vi.fn();
    const { container } = render(<SkillFilterBuilder {...makeProps({ onChange })} />);
    const [skillSelect, levelSelect] = container.querySelectorAll('select');
    fireEvent.change(skillSelect, { target: { value: 'Sniper' } });
    fireEvent.change(levelSelect, { target: { value: 'senior' } });
    await userEvent.click(screen.getByLabelText('Add skill requirement'));
    expect(onChange).toHaveBeenCalledWith([{ name: 'Sniper', min_level: 'senior' }]);
  });

  it('Add resets the form to defaults after a successful add', async () => {
    const onChange = vi.fn();
    const { container } = render(<SkillFilterBuilder {...makeProps({ onChange })} />);
    const skillSelect = container.querySelectorAll('select')[0] as HTMLSelectElement;
    const levelSelect = container.querySelectorAll('select')[1] as HTMLSelectElement;
    fireEvent.change(skillSelect, { target: { value: 'Medic' } });
    fireEvent.change(levelSelect, { target: { value: 'intermediate' } });
    await userEvent.click(screen.getByLabelText('Add skill requirement'));
    expect(skillSelect.value).toBe('');
    expect(levelSelect.value).toBe('junior');
  });

  it('Remove fires onChange with the named filter dropped', async () => {
    const value: SkillFilter[] = [
      { name: 'Medic', min_level: 'senior' },
      { name: 'Driver', min_level: 'junior' },
    ];
    const onChange = vi.fn();
    render(<SkillFilterBuilder {...makeProps({ value, onChange })} />);
    await userEvent.click(screen.getByLabelText('Remove Medic'));
    expect(onChange).toHaveBeenCalledWith([{ name: 'Driver', min_level: 'junior' }]);
  });

  it('level select shows "≥ Junior / Intermediate / Senior" labels', () => {
    const { container } = render(<SkillFilterBuilder {...makeProps()} />);
    const levelSelect = container.querySelectorAll('select')[1];
    const labels = Array.from(levelSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(labels).toEqual(['≥ Junior', '≥ Intermediate', '≥ Senior']);
  });
});
