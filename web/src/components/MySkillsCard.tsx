import { useState } from 'react';
import { Card } from './Card';
import { Icon } from './Icon';
import { Button, SkillChip } from './atoms';
import { useRemoveMemberSkill, useSetMemberSkill, useSkills } from '../lib/queries';
import { humanizeError } from '../lib/errors';
import {
  SKILL_LEVELS, SKILL_LEVEL_LABEL,
  type Member, type SkillLevel,
} from '../lib/types';

interface Props {
  member: Member;
  userName: string;
  teamId: string;
  onToast: (msg: string) => void;
}

/**
 * Reservist self-edit of their skill list (PRD §7.2). Pulls the
 * division-wide skill catalog and lets the reservist add / cycle level /
 * remove. The mutations run as the reservist themselves (actorId =
 * memberId) so RLS scopes them correctly.
 */
export function MySkillsCard({ member, userName, teamId, onToast }: Props) {
  const allSkills = useSkills(member.division_id);
  const setMemberSkill = useSetMemberSkill();
  const removeMemberSkill = useRemoveMemberSkill();

  const [editing, setEditing] = useState(false);
  const [addSkillName, setAddSkillName] = useState('');
  const [addSkillLevel, setAddSkillLevel] = useState<SkillLevel>('junior');

  const cycleSkillLevel = async (name: string, currentLevel: SkillLevel) => {
    const next = SKILL_LEVELS[(SKILL_LEVELS.indexOf(currentLevel) + 1) % SKILL_LEVELS.length];
    try {
      await setMemberSkill.mutateAsync({
        memberId: member.id,
        divisionId: member.division_id,
        skillName: name,
        level: next,
        actorId: member.id,
        actorName: userName,
        memberName: member.name,
        teamId,
      });
      onToast(`${name}: ${SKILL_LEVEL_LABEL[next]}`);
    } catch (err) {
      onToast(humanizeError(err, 'Failed to update skill'));
    }
  };

  const removeSkill = async (name: string) => {
    try {
      await removeMemberSkill.mutateAsync({
        memberId: member.id,
        divisionId: member.division_id,
        skillName: name,
        actorId: member.id,
        actorName: userName,
        memberName: member.name,
        teamId,
      });
      onToast(`Removed ${name}`);
    } catch (err) {
      onToast(humanizeError(err, 'Failed to remove skill'));
    }
  };

  const addSkill = async () => {
    if (!addSkillName) return;
    try {
      await setMemberSkill.mutateAsync({
        memberId: member.id,
        divisionId: member.division_id,
        skillName: addSkillName,
        level: addSkillLevel,
        actorId: member.id,
        actorName: userName,
        memberName: member.name,
        teamId,
      });
      setAddSkillName('');
      setAddSkillLevel('junior');
      onToast(`Added ${addSkillName}: ${SKILL_LEVEL_LABEL[addSkillLevel]}`);
    } catch (err) {
      onToast(humanizeError(err, 'Failed to add skill'));
    }
  };

  return (
    <Card
      title="My skills"
      right={
        <button className="filter-clear" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      }
    >
      {!editing ? (
        member.skills.length === 0 ? (
          <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
            No skills yet. Tap <b>Edit</b> to add what you know.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {member.skills.map((s) => (
              <SkillChip key={s.name} name={s.name} level={s.level} />
            ))}
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {member.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {member.skills.map((s) => (
                <div
                  key={s.name}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 6px 4px 10px', borderRadius: 16,
                    background: 'var(--paper-deep)',
                    border: '1px solid var(--line-soft)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <button
                    type="button"
                    onClick={() => cycleSkillLevel(s.name, s.level)}
                    disabled={setMemberSkill.isPending}
                    style={{
                      appearance: 'none', font: 'inherit', fontSize: 10.5,
                      padding: '2px 6px', borderRadius: 10, cursor: 'pointer',
                      border: '1px solid var(--accent)',
                      background: 'var(--accent-tint)',
                      color: 'var(--accent-deep)',
                      textTransform: 'uppercase', letterSpacing: '.04em',
                    }}
                    title="Cycle level: junior → intermediate → senior"
                  >
                    {SKILL_LEVEL_LABEL[s.level]}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSkill(s.name)}
                    disabled={removeMemberSkill.isPending}
                    aria-label={`Remove ${s.name}`}
                    style={{
                      appearance: 'none', font: 'inherit',
                      padding: 0, width: 20, height: 20, borderRadius: 10,
                      cursor: 'pointer',
                      border: 'none', background: 'transparent',
                      display: 'grid', placeItems: 'center',
                      color: 'var(--ink-soft)',
                    }}
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {(() => {
            const known = new Set(member.skills.map((s) => s.name));
            const available = (allSkills.data ?? []).filter((n) => !known.has(n));
            if (available.length === 0) {
              return (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                  You already have every skill in this division.
                </div>
              );
            }
            return (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={addSkillName}
                  onChange={(e) => setAddSkillName(e.target.value)}
                  style={{
                    flex: 1, minWidth: 140,
                    padding: '6px 8px',
                    border: '1px solid var(--line-strong)',
                    borderRadius: 6,
                    font: 'inherit', background: 'var(--card)', color: 'inherit',
                  }}
                >
                  <option value="">Add a skill…</option>
                  {available.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <select
                  value={addSkillLevel}
                  onChange={(e) => setAddSkillLevel(e.target.value as SkillLevel)}
                  style={{
                    padding: '6px 8px',
                    border: '1px solid var(--line-strong)',
                    borderRadius: 6,
                    font: 'inherit', background: 'var(--card)', color: 'inherit',
                  }}
                >
                  {SKILL_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>{SKILL_LEVEL_LABEL[lvl]}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="primary"
                  icon="check"
                  disabled={!addSkillName || setMemberSkill.isPending}
                  onClick={addSkill}
                >
                  Add
                </Button>
              </div>
            );
          })()}
        </div>
      )}
    </Card>
  );
}
