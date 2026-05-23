/**
 * SkillEditor — inline editor for a member's held skills.
 *
 * Pure presentational. Parent owns the held skill list, the catalog of
 * known names, the busy flag, and the onSet / onRemove dispatchers. Used
 * inside PersonDrawer.tsx; lives standalone so the heavier drawer file
 * stays focused on tab routing + drawer scaffolding.
 */

import { Icon } from './Icon';
import {
  SKILL_LEVELS, SKILL_LEVEL_LABEL,
  type SkillLevel,
} from '../lib/types';

interface Props {
  held: { name: string; level: SkillLevel }[];
  catalog: string[];
  busy: boolean;
  onSet: (name: string, level: SkillLevel) => void;
  onRemove: (name: string) => void;
}

export function SkillEditor({ held, catalog, busy, onSet, onRemove }: Props) {
  const heldMap = new Map(held.map((s) => [s.name, s.level]));
  const missing = catalog.filter((n) => !heldMap.has(n));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {held.map((s) => (
        <div key={s.name} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', borderRadius: 7,
          background: 'var(--paper-deep)', border: '1px solid var(--line-soft)',
        }}>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{s.name}</span>
          <div className="filter-group" style={{ height: 28 }}>
            {SKILL_LEVELS.map((lvl) => (
              <button key={lvl} data-on={s.level === lvl ? '1' : '0'}
                      disabled={busy}
                      style={{ height: 22, padding: '0 8px', fontSize: 11 }}
                      onClick={() => s.level !== lvl && onSet(s.name, lvl)}>
                {SKILL_LEVEL_LABEL[lvl]}
              </button>
            ))}
          </div>
          <button className="action-btn"
                  disabled={busy}
                  onClick={() => onRemove(s.name)}
                  aria-label={`Remove ${s.name}`}
                  title="Remove">
            <Icon name="x" size={12}/>
          </button>
        </div>
      ))}
      {missing.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 6, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Add skill
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {missing.map((name) => (
              <button key={name}
                      disabled={busy}
                      onClick={() => onSet(name, 'intermediate')}
                      style={{
                        appearance: 'none', font: 'inherit',
                        fontSize: 11, padding: '3px 8px', borderRadius: 4,
                        border: '1px dashed var(--line-strong)',
                        background: 'var(--card)',
                        color: 'var(--ink-2)',
                        cursor: 'pointer', fontWeight: 500,
                      }}>
                + {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
