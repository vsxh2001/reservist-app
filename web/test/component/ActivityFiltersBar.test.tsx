/**
 * ActivityFiltersBar tests — pure presentational component, all state via
 * props and all changes via callbacks. The component owns no mutations or
 * effects, so these tests just exercise the rendering + click contracts.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityFiltersBar, type ActivityFiltersBarProps } from '../../src/components/ActivityFiltersBar';

function makeProps(overrides: Partial<ActivityFiltersBarProps> = {}): ActivityFiltersBarProps {
  return {
    actorQuery: '',
    onActorQueryChange: vi.fn(),
    availableVerbs: ['created duty slot', 'assigned', 'cancelled'],
    selectedVerbs: [],
    onToggleVerb: vi.fn(),
    dateFrom: '',
    dateTo: '',
    onDateFromChange: vi.fn(),
    onDateToChange: vi.fn(),
    onClear: vi.fn(),
    hasActiveFilters: false,
    visibleCount: 12,
    totalCount: 30,
    onDownloadCSV: vi.fn(),
    ...overrides,
  };
}

describe('ActivityFiltersBar', () => {
  it('renders actor input, date pickers, verb buttons, and the counts label', () => {
    render(<ActivityFiltersBar {...makeProps()} />);
    expect(screen.getByLabelText('Filter by actor')).toBeInTheDocument();
    expect(screen.getByLabelText('From date')).toBeInTheDocument();
    expect(screen.getByLabelText('To date')).toBeInTheDocument();
    expect(screen.getByText('created duty slot')).toBeInTheDocument();
    expect(screen.getByText('assigned')).toBeInTheDocument();
    expect(screen.getByText('cancelled')).toBeInTheDocument();
    expect(screen.getByText('12 / 30')).toBeInTheDocument();
  });

  it('hides the verb-button group when availableVerbs is empty', () => {
    render(<ActivityFiltersBar {...makeProps({ availableVerbs: [] })} />);
    expect(screen.queryByRole('group', { name: 'Filter by verb' })).not.toBeInTheDocument();
  });

  it('hides the Clear button when hasActiveFilters is false', () => {
    render(<ActivityFiltersBar {...makeProps({ hasActiveFilters: false })} />);
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });

  it('shows the Clear button when hasActiveFilters is true and calls onClear', async () => {
    const onClear = vi.fn();
    render(<ActivityFiltersBar {...makeProps({ hasActiveFilters: true, onClear })} />);
    await userEvent.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('forwards actor input changes to onActorQueryChange', () => {
    // Component is controlled; the parent owns the value. Use fireEvent.change
    // so the assertion captures one full string instead of per-keystroke deltas
    // (which would require re-rendering with each character).
    const onActorQueryChange = vi.fn();
    render(<ActivityFiltersBar {...makeProps({ onActorQueryChange })} />);
    fireEvent.change(screen.getByLabelText('Filter by actor'), { target: { value: 'Avi' } });
    expect(onActorQueryChange).toHaveBeenCalledWith('Avi');
  });

  it('calls onToggleVerb with the verb name when a verb button is clicked', async () => {
    const onToggleVerb = vi.fn();
    render(<ActivityFiltersBar {...makeProps({ onToggleVerb })} />);
    await userEvent.click(screen.getByText('assigned'));
    expect(onToggleVerb).toHaveBeenCalledWith('assigned');
  });

  it('marks selected verbs with data-on="1" and unselected with "0"', () => {
    render(<ActivityFiltersBar {...makeProps({ selectedVerbs: ['assigned'] })} />);
    const group = screen.getByRole('group', { name: 'Filter by verb' });
    const assigned = within(group).getByText('assigned');
    const created = within(group).getByText('created duty slot');
    expect(assigned).toHaveAttribute('data-on', '1');
    expect(created).toHaveAttribute('data-on', '0');
  });

  it('disables Download CSV when visibleCount is 0', () => {
    render(<ActivityFiltersBar {...makeProps({ visibleCount: 0 })} />);
    expect(screen.getByText('Download CSV').closest('button')).toBeDisabled();
  });

  it('enables Download CSV when visibleCount > 0 and calls onDownloadCSV', async () => {
    const onDownloadCSV = vi.fn();
    render(<ActivityFiltersBar {...makeProps({ visibleCount: 5, onDownloadCSV })} />);
    await userEvent.click(screen.getByText('Download CSV'));
    expect(onDownloadCSV).toHaveBeenCalledTimes(1);
  });

  it('forwards date input changes to onDateFromChange / onDateToChange', async () => {
    const onDateFromChange = vi.fn();
    const onDateToChange = vi.fn();
    render(<ActivityFiltersBar {...makeProps({ onDateFromChange, onDateToChange })} />);
    const from = screen.getByLabelText('From date');
    const to = screen.getByLabelText('To date');
    await userEvent.type(from, '2026-06-10');
    expect(onDateFromChange).toHaveBeenCalled();
    await userEvent.type(to, '2026-06-20');
    expect(onDateToChange).toHaveBeenCalled();
  });
});
