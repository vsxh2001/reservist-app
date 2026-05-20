import React, { useState, useRef, useEffect } from 'react';
import { Avatar, Button } from './atoms';
import { Icon } from './Icon';
import {
  useDivision,
  useProjects,
  useTeamsForDivision,
  useMembersInDivision,
  useCreateProject,
  useUpdateProject,
  useCreateTeam,
  useUpdateTeam,
  useSetDivisionAdmin,
  useSkills,
  useAddSkill,
  useDeleteSkill,
} from '../lib/queries';
import { useActiveTeam } from '../lib/team-context';
import { useMyMember } from '../lib/queries';
import { useAuth } from '../lib/auth';
import type { Team } from '../lib/types';

interface Props {
  onOpenTeam: (teamId: string) => void;
  onToast: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Inline-rename input
// ---------------------------------------------------------------------------
function InlineEdit({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async () => {
    const v = draft.trim();
    if (!v || v === value) { setEditing(false); setDraft(value); return; }
    setBusy(true);
    try {
      await onSave(v);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <span
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onClick={() => { setDraft(value); setEditing(true); }}
        title="Click to rename"
      >
        {value}
        <Icon name="edit" size={12} style={{ color: 'var(--ink-soft)', opacity: 0.6 }} />
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { void save(); }
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        }}
        style={{
          font: 'inherit', fontSize: 13, fontWeight: 600,
          border: '1px solid var(--accent)', borderRadius: 5, padding: '2px 6px',
          background: 'var(--paper)', color: 'var(--ink)',
          outline: 'none',
        }}
        disabled={busy}
      />
      <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy}>
        {busy ? '…' : 'Save'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(value); }}>
        Cancel
      </Button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// New-team modal (simple inline)
// ---------------------------------------------------------------------------
function NewTeamRow({ onAdd }: { onAdd: (name: string, crest: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [crest, setCrest] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await onAdd(n, crest.trim() || '🏴');
      setName(''); setCrest(''); setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" icon="plus" onClick={() => setOpen(true)}>
        New team
      </Button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
      <input
        autoFocus
        value={crest}
        onChange={(e) => setCrest(e.target.value)}
        placeholder="🏴"
        style={{ width: 48, font: 'inherit', fontSize: 18, border: '1px solid var(--line-strong)', borderRadius: 5, padding: '3px 6px', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }}
        maxLength={4}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Team name"
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') setOpen(false); }}
        style={{ flex: 1, minWidth: 120, font: 'inherit', fontSize: 13, border: '1px solid var(--line-strong)', borderRadius: 5, padding: '4px 8px', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }}
        disabled={busy}
      />
      <Button variant="primary" size="sm" onClick={() => void submit()} disabled={busy || !name.trim()}>
        {busy ? '…' : 'Create'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared layout helpers (defined outside render to satisfy react/no-component-in-render)
// ---------------------------------------------------------------------------
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--line)', padding: '16px 20px', ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 12 }}>
      {children}
    </div>
  );
}

function EditableTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="tag" style={{ display: 'inline-flex', gap: 4, paddingRight: 4 }}>
      {label}
      <button
        onClick={onRemove}
        title="Remove"
        style={{
          appearance: 'none', border: 0, background: 'transparent',
          padding: 0, marginLeft: 2, cursor: 'pointer', color: 'var(--ink-mute)',
          display: 'grid', placeItems: 'center',
        }}>
        <Icon name="x" size={10} />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export function DivisionAdminScreen({ onOpenTeam, onToast }: Props) {
  const { user } = useAuth();
  const division = useDivision();
  const { teams: allTeams } = useActiveTeam();

  const divisionId = division.data?.id;

  const projects = useProjects(divisionId);
  const teamsForDiv = useTeamsForDivision(divisionId);
  const members = useMembersInDivision(divisionId);
  const myMember = useMyMember(user?.id);

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const setAdmin = useSetDivisionAdmin();

  const skills = useSkills(divisionId);
  const addSkill = useAddSkill();
  const delSkill = useDeleteSkill();

  const [newProjectName, setNewProjectName] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newSkill, setNewSkill] = useState('');

  // First team in division to anchor activity_log for division-level ops.
  const firstTeamId = (teamsForDiv.data ?? [])[0]?.id ?? (allTeams[0]?.id ?? '');
  const actorId = myMember.data?.id ?? '';
  const actorName = myMember.data?.name ?? user?.name ?? 'Admin';

  // Group teams by project_id
  const teamsByProject = new Map<string, Team[]>();
  for (const t of teamsForDiv.data ?? []) {
    const bucket = teamsByProject.get(t.project_id) ?? [];
    bucket.push(t);
    teamsByProject.set(t.project_id, bucket);
  }

  const admins = (members.data ?? []).filter((m) => m.is_division_admin);
  const nonAdmins = (members.data ?? []).filter((m) => !m.is_division_admin);

  const handleCreateProject = async () => {
    const n = newProjectName.trim();
    if (!n || !divisionId || !firstTeamId) return;
    setBusy(true);
    try {
      const nextIdx = (projects.data ?? []).length;
      await createProject.mutateAsync({
        divisionId, name: n, sortIdx: nextIdx,
        actorId, actorName, unitId: firstTeamId,
      });
      setNewProjectName('');
      setAddingProject(false);
      onToast(`Project "${n}" created`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setBusy(false);
    }
  };

  const handleRenameProject = async (projectId: string, name: string) => {
    await updateProject.mutateAsync({
      projectId, patch: { name },
      actorId, actorName, unitId: firstTeamId,
    });
    onToast(`Project renamed to "${name}"`);
  };

  const handleCreateTeam = async (projectId: string, name: string, crest: string) => {
    if (!divisionId || !firstTeamId) return;
    await createTeam.mutateAsync({
      projectId, divisionId, name, crest,
      actorId, actorName, unitId: firstTeamId,
    });
    onToast(`Team "${name}" created`);
  };

  const handleRenameTeam = async (teamId: string, name: string) => {
    await updateTeam.mutateAsync({
      teamId, patch: { name },
      actorId, actorName,
    });
    onToast(`Team renamed to "${name}"`);
  };

  const handleAddSkill = async () => {
    const n = newSkill.trim();
    if (!n || !divisionId) return;
    try {
      await addSkill.mutateAsync({ divisionId, name: n });
      setNewSkill('');
      onToast(`Skill "${n}" added`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to add skill');
    }
  };

  const handleDelSkill = async (name: string) => {
    if (!divisionId) return;
    try {
      await delSkill.mutateAsync({ divisionId, name });
      onToast(`Skill "${name}" removed`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to remove skill');
    }
  };

  const handleToggleAdmin = async (memberId: string, memberName: string, currentlyAdmin: boolean) => {
    if (memberId === actorId && currentlyAdmin) {
      onToast('You cannot revoke your own admin role.');
      return;
    }
    if (!firstTeamId) return;
    try {
      await setAdmin.mutateAsync({
        memberId, isAdmin: !currentlyAdmin,
        actorId, actorName, memberName, unitId: firstTeamId,
      });
      onToast(currentlyAdmin ? `Revoked admin from ${memberName}` : `${memberName} is now a division admin`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to update admin status');
    }
  };

  if (division.isLoading || projects.isLoading || teamsForDiv.isLoading) {
    return <div style={{ padding: 40, color: 'var(--ink-soft)' }}>Loading…</div>;
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Division Admins */}
      <Card>
        <SectionLabel>Division admins</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {admins.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar initials={m.initials} tone={m.tone} status={m.status} size="sm" />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{m.name}</span>
              <Icon name="shield" size={13} style={{ color: 'var(--accent)' }} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleToggleAdmin(m.id, m.name, true)}
                disabled={m.id === actorId}
                title={m.id === actorId ? 'Cannot revoke your own admin role' : 'Revoke admin'}
              >
                Revoke
              </Button>
            </div>
          ))}
          {admins.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>No division admins yet.</div>
          )}
        </div>

        {nonAdmins.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 8 }}>Grant admin to a member:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {nonAdmins.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar initials={m.initials} tone={m.tone} status={m.status} size="sm" />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-soft)' }}>{m.name}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleToggleAdmin(m.id, m.name, false)}
                  >
                    Make admin
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Skills */}
      <Card>
        <SectionLabel>Skill tags ({(skills.data ?? []).length}) · division-wide</SectionLabel>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>
          Skills are shared across all teams in this division.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {(skills.data ?? []).map((s) => (
            <EditableTag key={s} label={s} onRemove={() => void handleDelSkill(s)} />
          ))}
          {(skills.data ?? []).length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>No skills yet.</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            placeholder="New skill tag"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddSkill(); }}
            style={{ flex: 1 }}
            disabled={!divisionId || addSkill.isPending}
          />
          <Button
            size="sm"
            variant="primary"
            icon="plus"
            disabled={!newSkill.trim() || !divisionId || addSkill.isPending}
            onClick={() => void handleAddSkill()}
          >
            Add skill
          </Button>
        </div>
      </Card>

      {/* Projects & Teams */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <SectionLabel>Projects &amp; teams</SectionLabel>
          {!addingProject && (
            <Button variant="outline" size="sm" icon="plus" onClick={() => setAddingProject(true)}>
              New project
            </Button>
          )}
        </div>

        {addingProject && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateProject(); if (e.key === 'Escape') setAddingProject(false); }}
                style={{ flex: 1, font: 'inherit', fontSize: 13, border: '1px solid var(--line-strong)', borderRadius: 6, padding: '5px 10px', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }}
                disabled={busy}
              />
              <Button variant="primary" size="sm" onClick={() => void handleCreateProject()} disabled={busy || !newProjectName.trim()}>
                {busy ? '…' : 'Create'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setAddingProject(false); setNewProjectName(''); }}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(projects.data ?? []).length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>No projects yet. Create one above.</div>
          )}
          {(projects.data ?? []).map((project) => {
            const teams = teamsByProject.get(project.id) ?? [];
            return (
              <Card key={project.id}>
                {/* Project header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: teams.length > 0 ? 14 : 0 }}>
                  <Icon name="slots" size={14} style={{ color: 'var(--ink-soft)' }} />
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
                    <InlineEdit
                      value={project.name}
                      onSave={(name) => handleRenameProject(project.id, name)}
                    />
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Team rows */}
                {teams.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {teams.map((team) => (
                      <div
                        key={team.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: 'var(--paper)', borderRadius: 8,
                          border: '1px solid var(--line)', padding: '8px 12px',
                        }}
                      >
                        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{team.crest}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            <InlineEdit
                              value={team.name}
                              onSave={(name) => handleRenameTeam(team.id, name)}
                            />
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)' }}>
                            {team.member_count} member{team.member_count !== 1 ? 's' : ''} · {team.commander_count} cmd
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onOpenTeam(team.id)}
                          title="Switch to this team"
                        >
                          Open
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new team */}
                <NewTeamRow
                  onAdd={(name, crest) => handleCreateTeam(project.id, name, crest)}
                />
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
