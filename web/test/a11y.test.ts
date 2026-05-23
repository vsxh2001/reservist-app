import { describe, it, expect, vi } from 'vitest';
import type { KeyboardEvent, SyntheticEvent } from 'react';
import { activate } from '../src/lib/a11y';

function makeKeyEvent(key: string, sameTarget = true): KeyboardEvent {
  const node = {};
  return {
    key,
    target: sameTarget ? node : {},
    currentTarget: node,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe('activate()', () => {
  it('returns role="button" and tabIndex=0 so the element joins the tab order', () => {
    const props = activate(() => {});
    expect(props.role).toBe('button');
    expect(props.tabIndex).toBe(0);
  });

  it('forwards click to the activate handler', () => {
    const onActivate = vi.fn();
    const props = activate(onActivate);
    const clickEvt = { type: 'click' } as unknown as SyntheticEvent;
    props.onClick(clickEvt);
    expect(onActivate).toHaveBeenCalledWith(clickEvt);
  });

  it('fires the handler on Enter and prevents default', () => {
    const onActivate = vi.fn();
    const props = activate(onActivate);
    const evt = makeKeyEvent('Enter');
    props.onKeyDown(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(onActivate).toHaveBeenCalledWith(evt);
  });

  it('fires the handler on Space and prevents default (avoids page scroll)', () => {
    const onActivate = vi.fn();
    const props = activate(onActivate);
    const evt = makeKeyEvent(' ');
    props.onKeyDown(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(onActivate).toHaveBeenCalledWith(evt);
  });

  it('ignores other keys (Tab, Arrow keys, letter keys)', () => {
    const onActivate = vi.fn();
    const props = activate(onActivate);
    for (const key of ['Tab', 'ArrowDown', 'Escape', 'a', 'Shift']) {
      const evt = makeKeyEvent(key);
      props.onKeyDown(evt);
      expect(evt.preventDefault).not.toHaveBeenCalled();
    }
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores key events that bubbled from a focusable child (target !== currentTarget)', () => {
    const onActivate = vi.fn();
    const props = activate(onActivate);
    const evt = makeKeyEvent('Enter', false);
    props.onKeyDown(evt);
    expect(evt.preventDefault).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });
});
