import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Bomb({ message = 'boom' }: { message?: string }): JSX.Element {
  throw new Error(message);
}

// A toggleable child: starts throwing, can be told to stop via setShouldThrow(false).
// Used to verify "Try again" resets state then re-renders the (now-non-throwing) child.
function ToggleBomb({
  initialThrow = true,
  message = 'boom',
}: {
  initialThrow?: boolean;
  message?: string;
}): JSX.Element {
  const [shouldThrow] = useState(initialThrow);
  if (shouldThrow) throw new Error(message);
  return <div>recovered child</div>;
}

// ---------------------------------------------------------------------------
// Suppress React's caught-error log noise (happy-dom logs it to stderr).
// ---------------------------------------------------------------------------
let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------
describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div>healthy child</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('healthy child')).toBeInTheDocument();
    expect(screen.queryByText('Something broke')).not.toBeInTheDocument();
  });

  it('catches a throwing child and renders the fallback UI', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something broke')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeInTheDocument();
  });

  it('fallback displays the error message text', () => {
    render(
      <ErrorBoundary>
        <Bomb message="kaboom-detail" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('kaboom-detail')).toBeInTheDocument();
  });

  it('clicking "Try again" resets state and re-renders children', async () => {
    const user = userEvent.setup();
    // ToggleBomb's internal `shouldThrow` is sticky once committed; but the
    // outer ErrorBoundary remounts the children subtree when reset is called
    // and we swap the prop. To test reset semantics, use a wrapper that
    // controls whether the child is the bomb at all.
    function Harness() {
      const [armed, setArmed] = useState(true);
      return (
        <div>
          <button type="button" onClick={() => setArmed(false)}>disarm</button>
          <ErrorBoundary>
            {armed ? <Bomb message="initial-failure" /> : <div>recovered child</div>}
          </ErrorBoundary>
        </div>
      );
    }

    render(<Harness />);
    // Fallback is showing.
    expect(screen.getByText('Something broke')).toBeInTheDocument();
    expect(screen.getByText('initial-failure')).toBeInTheDocument();

    // Disarm the bomb (so children no longer throw on next render).
    await user.click(screen.getByRole('button', { name: 'disarm' }));
    // Boundary still has error state -> still showing fallback.
    expect(screen.getByText('Something broke')).toBeInTheDocument();

    // Click "Try again" — reset clears boundary state, children render fresh.
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByText('Something broke')).not.toBeInTheDocument();
    expect(screen.getByText('recovered child')).toBeInTheDocument();
  });

  it('renders nested ErrorBoundary children: innermost catches first', () => {
    render(
      <ErrorBoundary>
        <div>outer-content</div>
        <ErrorBoundary>
          <Bomb message="inner-boom" />
        </ErrorBoundary>
      </ErrorBoundary>,
    );
    // Inner boundary caught it: outer is still rendering its sibling content.
    expect(screen.getByText('outer-content')).toBeInTheDocument();
    // Inner shows the fallback once.
    expect(screen.getAllByText('Something broke')).toHaveLength(1);
    expect(screen.getByText('inner-boom')).toBeInTheDocument();
  });

  it('falls back to "Unknown error." when error has no message', () => {
    function EmptyBomb(): JSX.Element {
      throw new Error('');
    }
    render(
      <ErrorBoundary>
        <EmptyBomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Unknown error.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Skipped behaviors (documented):
// - "Reload app" button calls `window.location.reload()`. happy-dom does not
//   implement navigation/reload; stubbing window.location.reload across
//   happy-dom is brittle and not part of the component's own logic, so the
//   click handler is intentionally not asserted here.
// - `componentDidCatch` invokes `console.error` with the component stack.
//   Asserting that would couple this test to React's internal stack format
//   and the dev-only error logger; the suppression spy already proves the
//   call path runs without throwing.
// ---------------------------------------------------------------------------
