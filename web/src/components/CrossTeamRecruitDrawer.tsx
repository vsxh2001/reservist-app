import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Avatar, Button } from './atoms';
import {
  useMembersInDivision,
  useUpdateTeamMembership,
  useTeamsForMember,
} from '../lib/queries';
import { useActiveTeam } from '../lib/team-context';
import { useDivision } from '../lib/queries';
import { useAuth } from '../lib/auth';
import type { Member, Team } from '../lib/types';
import { humanizeError } from '../lib/errors';

interface Props {
  onClose: () => void;
  onToast: (msg: string) => void;
}

// Row for a single division member in the recruit list.
function RecruitRow({
  member,
  checked,
  onToggle,
}: {
  member: Member;
  checked: boolean;
  onToggle: () => void;
}) {
  const teams = useTeamsForMember(member.id);
  const teamCount = teams.data?.length ?? 0;

  return (
    <button
      onClick={onToggle}
      aria-pressed={checked}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        minHeight: 48,
        padding: '8px 14px',
        appearance: 'none',
        border: 0,
        borderRadius: 8,
        background: checked ? 'var(--accent-tint)' : 'transparent',
        cursor: 'pointer',
        font: 'inherit',
        textAlign: 'start',
        outline: checked ? '2px solid color-mix(in srgb, var(--accent) 40%, transparent)' : 'none',
        outlineOffset: -2,
        transition: 'background .12s',
      }}
    >
      {/* Checkbox */}
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: '1.5px solid ' + (checked ? 'var(--accent)' : 'var(--line-strong)'),
          background: checked ? 'var(--accent)' : 'var(--card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all .1s',
        }}
      >
        {checked && <Icon name="check" size={11} stroke={2.5} style={{ color: 'var(--card)' }} />}
      </span>

      <Avatar initials={member.initials} tone={member.tone} status={member.status} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {member.name}
        </div>
        {member.status_note && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {member.status_note}
          </div>
        )}
      </div>

      <span style={{
        flexShrink: 0,
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--ink-mute)',
        background: 'var(--paper-deep)',
        border: '1px solid var(--line-soft)',
        borderRadius: 4,
        padding: '1px 6px',
      }}>
        {teams.isLoading ? '…' : `${teamCount} team${teamCount === 1 ? '' : 's'}`}
      </span>
    </button>
  );
}

export function CrossTeamRecruitDrawer({ onClose, onToast }: Props) {
  const { user } = useAuth();
  const { team: activeTeam, teams: commanderTeams } = useActiveTeam();
  const division = useDivision();
  const divisionId = division.data?.id;

  // The destination team — defaults to active team, picker shown if commander commands multiple.
  const [destTeamId, setDestTeamId] = useState<string>(activeTeam?.id ?? '');
  const destTeam: Team | undefined = commanderTeams.find((t) => t.id === (destTeamId || activeTeam?.id));

  // Sync destTeamId when activeTeam loads
  const resolvedDestId = destTeamId || activeTeam?.id || '';

  const divisionMembers = useMembersInDivision(divisionId);
  const updateMembership = useUpdateTeamMembership();

  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Members already on the destination team (by team membership info from member.teams)
  const alreadyOnTeam = useMemo(() => {
    const set = new Set<string>();
    for (const m of divisionMembers.data ?? []) {
      if (m.teams.some((tm) => tm.team_id === resolvedDestId)) {
        set.add(m.id);
      }
    }
    return set;
  }, [divisionMembers.data, resolvedDestId]);

  // Filtered + searchable list, excluding members already on destination team
  const visible = useMemo(() => {
    const lower = q.toLowerCase().trim();
    return (divisionMembers.data ?? []).filter((m) => {
      if (alreadyOnTeam.has(m.id)) return false;
      if (!lower) return true;
      return m.name.toLowerCase().includes(lower) ||
             m.phone.includes(lower);
    });
  }, [divisionMembers.data, alreadyOnTeam, q]);

  const toggleMember = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Clear selection when destination team changes
  const handleDestChange = (id: string) => {
    setDestTeamId(id);
    setSelected(new Set());
  };

  const handleAdd = async () => {
    if (!user || !resolvedDestId || selected.size === 0) return;
    const toAdd = [...selected].filter((id) => !alreadyOnTeam.has(id));
    if (toAdd.length === 0) return;

    try {
      await Promise.all(
        toAdd.map((memberId) => {
          const member = divisionMembers.data?.find((m) => m.id === memberId);
          return updateMembership.mutateAsync({
            teamId: resolvedDestId,
            memberId,
            role: 'soldier',
            actorId: user.id,
            actorName: user.name,
            memberName: member?.name ?? memberId,
          });
        }),
      );
      const noun = toAdd.length === 1 ? '1 member' : `${toAdd.length} members`;
      const teamLabel = destTeam?.name ?? 'team';
      onToast(`Recruited ${noun} to ${teamLabel}`);
      setSelected(new Set());
      onClose();
    } catch (err) {
      onToast(humanizeError(err, 'Recruit failed'));
    }
  };

  const isLoading = divisionMembers.isLoading || division.isLoading;
  const teamLabel = destTeam?.name ?? (activeTeam?.name ?? 'team');

  return (
    <>
      <div className="drawer-overlay" data-open="1" onClick={onClose} />
      <div className="drawer" data-open="1" role="dialog" aria-label={`Recruit to ${teamLabel}`}>

        {/* Header */}
        <div className="drawer-head" style={{ flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="name" style={{ fontSize: 22 }}>
                Recruit to <em>{teamLabel}</em>
              </h3>
            </div>
            <button
              className="action-btn"
              onClick={onClose}
              aria-label="Close"
              style={{ alignSelf: 'flex-start', flexShrink: 0 }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>

          {/* Team picker — only if commander commands more than one team */}
          {commanderTeams.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-mute)',
                flexShrink: 0,
              }}>
                Destination team
              </span>
              <select
                value={resolvedDestId}
                onChange={(e) => handleDestChange(e.target.value)}
                style={{
                  flex: 1,
                  appearance: 'none',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 7,
                  background: 'var(--card)',
                  color: 'var(--ink)',
                  font: 'inherit',
                  fontSize: 13,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  outline: 'none',
                  minHeight: 40,
                }}
              >
                {commanderTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.crest} {t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Search */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--line-soft)',
          background: 'var(--card-soft)',
        }}>
          <div className="search" style={{ margin: 0 }}>
            <Icon name="search" size={14} />
            <input
              placeholder="Search by name or phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              style={{ flex: 1 }}
            />
            {q && (
              <button
                className="action-btn"
                onClick={() => setQ('')}
                aria-label="Clear search"
                style={{ background: 'transparent', border: 0 }}
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Body — member list */}
        <div className="drawer-body" style={{ padding: '8px 6px' }}>
          {isLoading ? (
            <div style={{ padding: '24px 16px', color: 'var(--ink-soft)', fontSize: 13 }}>
              Loading division members…
            </div>
          ) : divisionMembers.error ? (
            <div style={{ padding: '24px 16px', color: 'var(--urgent-deep)', fontSize: 13 }}>
              Failed to load members.
            </div>
          ) : visible.length === 0 ? (
            <div style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--ink-soft)',
              fontSize: 13,
            }}>
              <Icon name="users" size={28} stroke={1.2} style={{ margin: '0 auto 10px', display: 'block', color: 'var(--ink-mute)' }} />
              {q
                ? 'No members match that search.'
                : alreadyOnTeam.size > 0
                  ? 'All division members are already on this team.'
                  : 'No members in division yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {visible.map((m) => (
                <RecruitRow
                  key={m.id}
                  member={m}
                  checked={selected.has(m.id)}
                  onToggle={() => toggleMember(m.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--line-soft)',
          background: 'var(--card-soft)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-soft)' }}>
            {selected.size === 0
              ? 'Select members to recruit'
              : `${selected.size} member${selected.size === 1 ? '' : 's'} selected`}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="users"
            disabled={selected.size === 0 || updateMembership.isPending}
            onClick={handleAdd}
          >
            {updateMembership.isPending
              ? 'Adding…'
              : `Add ${selected.size > 0 ? selected.size : ''} selected`.trim()}
          </Button>
        </div>
      </div>
    </>
  );
}
