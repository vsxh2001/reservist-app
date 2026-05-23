/**
 * SkillFilterBuilder — composes a list of `{ name, min_level }` skill
 * requirements for the Roster filter bar. Lives in its own file so the
 * heavier Roster component stays focused on table + bulk-action logic.
 *
 * Pure presentational: parent owns `value` + `onChange`.
 */

import { useState } from 'react';
import { Icon } from './Icon';
import { SkillChip } from './atoms';
import {
  SKILL_LEVELS, SKILL_LEVEL_LABEL,
  type SkillFilter, type SkillLevel,
} from '../lib/types';

interface Props {
  options: string[];
  value: SkillFilter[];
  onChange: (v: SkillFilter[]) => void;
}

export function SkillFilterBuilder({ options, value, onChange }: Props) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState<SkillLevel>('junior');

  const taken = new Set(value.map((v) => v.name));
  const available = options.filter((o) => !taken.has(o));

  const add = () => {
    if (!name) return;
    onChange([...value, { name, min_level: level }]);
    setName('');
    setLevel('junior');
  };
  const remove = (n: string) => onChange(value.filter((v) => v.name !== n));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        border: '1px solid var(--line-strong)', borderRadius: 7,
        background: 'var(--card)', height: 30, paddingInline: 6,
      }}>
        <Icon name="skill" size={13} />
        <select
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            appearance: 'none', border: 0, background: 'transparent',
            font: 'inherit', fontSize: 12.5, color: 'var(--ink-2)',
            paddingInline: 4, cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">Skill…</option>
          {available.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span style={{ width: 1, height: 16, background: 'var(--line)' }} />
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as SkillLevel)}
          aria-label="Minimum level"
          style={{
            appearance: 'none', border: 0, background: 'transparent',
            font: 'inherit', fontSize: 12.5, color: 'var(--ink-2)',
            paddingInline: 4, cursor: 'pointer', outline: 'none',
          }}
        >
          {SKILL_LEVELS.map((l) => (
            <option key={l} value={l}>{`≥ ${SKILL_LEVEL_LABEL[l]}`}</option>
          ))}
        </select>
        <button
          className="action-btn"
          style={{ background: 'transparent', border: 0 }}
          disabled={!name}
          aria-label="Add skill requirement"
          onClick={add}
        >
          <Icon name="plus" size={12} />
        </button>
      </div>
      {value.map((s) => (
        <span
          key={s.name}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <SkillChip name={s.name} min_level={s.min_level} />
          <button
            className="filter-clear"
            aria-label={`Remove ${s.name}`}
            onClick={() => remove(s.name)}
            style={{ paddingInline: 4 }}
          >
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}
