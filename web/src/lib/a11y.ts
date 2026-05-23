/**
 * a11y.ts — accessibility helpers for non-button clickable elements.
 *
 * Several spots in the UI use styled `<span>` or `<div>` elements as clickable
 * controls (sidebar nav items, inline "Edit" toggles, slot cards). Without
 * extra wiring those elements are mouse-only — they can't be tabbed to and
 * Enter/Space do nothing, which breaks keyboard navigation and screen reader
 * announcement.
 *
 * `activate()` returns the minimum props needed to make any element behave
 * like a button for keyboard users: `role`, `tabIndex`, `onClick`, and an
 * `onKeyDown` that fires the same handler on Enter or Space.
 *
 * Prefer a real `<button>` when feasible — this helper is the bridge for
 * styled elements where converting to `<button>` would be invasive.
 */

import type { KeyboardEvent, SyntheticEvent } from 'react';

export function activate(onActivate: (e: SyntheticEvent) => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      // Only fire when the host element itself is focused. Without this,
      // pressing Enter on a focusable child (an inner <button>, an <input>,
      // a nested role=button) would bubble up and trigger the host handler
      // a second time. Mouse clicks aren't filtered — children typically
      // call e.stopPropagation() themselves where needed.
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate(e);
      }
    },
  };
}
