/**
 * MyProfileSection — top-of-dashboard identity block.
 *
 * Combines the multi-team picker (pills, only shown when the reservist
 * belongs to >1 team) with the profile card (avatar, name, current team,
 * skill chips). Sits above NextDeploymentBanner per PRD §7.6 — establishes
 * "who am I, where am I" before any duty-related content.
 */

import { Avatar, SkillChip } from './atoms';
import { splitName } from '../lib/text';
import type { Member, Team } from '../lib/types';

interface Props {
  me: Member;
  team: Team | null;
  teams: Team[];
  onSelectTeam: (teamId: string) => void;
}

export function MyProfileSection({ me, team, teams, onSelectTeam }: Props) {
  return (
    <>
      {teams.length > 1 && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap',
          marginBottom: 16,
        }}>
          {teams.map((t) => {
            const selected = team?.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onSelectTeam(t.id)}
                style={{
                  appearance: 'none', font: 'inherit',
                  fontSize: 12, padding: '5px 12px', borderRadius: 20,
                  border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--line-strong)'),
                  background: selected ? 'var(--accent-tint)' : 'var(--card)',
                  color: selected ? 'var(--accent-deep)' : 'var(--ink-2)',
                  cursor: 'pointer', fontWeight: selected ? 600 : 400,
                }}
              >
                {t.crest && <span style={{ marginInlineEnd: 6 }}>{t.crest}</span>}
                {t.name}
              </button>
            );
          })}
        </div>
      )}

      <section style={{
        display: 'flex', gap: 14, alignItems: 'center',
        padding: 18, marginBottom: 18,
        background: 'var(--card)', border: '1px solid var(--line)',
        borderRadius: 14,
      }}>
        <Avatar initials={me.initials} tone={me.tone} status={me.status} size="xl" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 400, lineHeight: 1.1,
          }}>
            {(() => { const n = splitName(me.name); return <>{n.first} <em style={{ color: 'var(--ink-soft)' }}>{n.rest}</em></>; })()}
          </div>
          <div
            data-testid="profile-team"
            style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {team?.crest && <span aria-hidden="true">{team.crest}</span>}
            <span>{team?.name}</span>
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {me.skills.map((s) => <SkillChip key={s.name} name={s.name} level={s.level} />)}
          </div>
        </div>
      </section>
    </>
  );
}
