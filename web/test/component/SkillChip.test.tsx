/**
 * Extended SkillChip tests.
 *
 * atoms.test.tsx already covers: name rendering, senior label, min_level "≥" prefix,
 * and absence of ≥ in member-context.
 *
 * This file adds: all three level variants, data-level / data-kind attributes,
 * title tooltip text, and the intermediate min_level case.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillChip } from '../../src/components/atoms';

describe('SkillChip — level variants (member context)', () => {
  it.each([
    ['junior',       'Junior'],
    ['intermediate', 'Intermediate'],
    ['senior',       'Senior'],
  ] as const)('renders "%s" label for level=%s', (level, label) => {
    render(<SkillChip name="Driving" level={level} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('sets data-level attribute to the level value', () => {
    const { container } = render(<SkillChip name="Nav" level="intermediate" />);
    const chip = container.querySelector('.skill-chip');
    expect(chip).toHaveAttribute('data-level', 'intermediate');
  });

  it('sets data-kind="have" in member context', () => {
    const { container } = render(<SkillChip name="Nav" level="junior" />);
    const chip = container.querySelector('.skill-chip');
    expect(chip).toHaveAttribute('data-kind', 'have');
  });

  it('title attribute contains "Level: Senior" for member context senior', () => {
    const { container } = render(<SkillChip name="Marksmanship" level="senior" />);
    const chip = container.querySelector('.skill-chip');
    expect(chip?.getAttribute('title')).toContain('Level: Senior');
  });
});

describe('SkillChip — min_level variants (requirement context)', () => {
  it.each([
    ['junior',       'Junior'],
    ['intermediate', 'Intermediate'],
    ['senior',       'Senior'],
  ] as const)('renders "%s" label for min_level=%s', (level, label) => {
    render(<SkillChip name="Driving" min_level={level} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('sets data-level to the min_level value', () => {
    const { container } = render(<SkillChip name="Driving" min_level="senior" />);
    const chip = container.querySelector('.skill-chip');
    expect(chip).toHaveAttribute('data-level', 'senior');
  });

  it('sets data-kind="req" in requirement context', () => {
    const { container } = render(<SkillChip name="Driving" min_level="junior" />);
    const chip = container.querySelector('.skill-chip');
    expect(chip).toHaveAttribute('data-kind', 'req');
  });

  it('title attribute describes the requirement with "or higher"', () => {
    const { container } = render(<SkillChip name="Driving" min_level="intermediate" />);
    const chip = container.querySelector('.skill-chip');
    expect(chip?.getAttribute('title')).toContain('or higher');
  });

  it('renders the ≥ glyph span (aria-hidden) for each min_level', () => {
    const { container } = render(<SkillChip name="Signals" min_level="junior" />);
    const gte = container.querySelector('.skill-chip-gte');
    expect(gte).toBeInTheDocument();
    expect(gte).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders skill name in its own span', () => {
    const { container } = render(<SkillChip name="Logistics" min_level="senior" />);
    const nameSpan = container.querySelector('.skill-chip-name');
    expect(nameSpan).toBeInTheDocument();
    expect(nameSpan?.textContent).toBe('Logistics');
  });
});
