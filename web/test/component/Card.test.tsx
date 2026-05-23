/**
 * Card tests — shared title/right-slot panel introduced in #89.
 *
 * The component is one element deep so these tests just pin the contract:
 * title text, children pass-through, optional right slot, and rendering as
 * a <section> for landmark purposes.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../../src/components/Card';

describe('Card', () => {
  it('renders the title text exactly as passed', () => {
    render(<Card title="My status"><div /></Card>);
    expect(screen.getByText('My status')).toBeInTheDocument();
  });

  it('renders children inside the section', () => {
    render(<Card title="X"><span data-testid="payload">hello</span></Card>);
    expect(screen.getByTestId('payload')).toHaveTextContent('hello');
  });

  it('renders the right-slot content when provided', () => {
    render(
      <Card title="Header" right={<button>Edit</button>}>
        <div />
      </Card>,
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('omits the right slot when not provided', () => {
    const { container } = render(<Card title="X"><div /></Card>);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('emits a <section> element so landmark navigation lists it', () => {
    const { container } = render(<Card title="X"><div /></Card>);
    expect(container.querySelector('section')).not.toBeNull();
  });
});
