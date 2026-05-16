import { useState } from 'react';
import { Button } from './atoms';
import { Icon } from './Icon';
import { supabase } from '../lib/supabase';
import { useAddSkill, useDeleteSkill } from '../lib/queries';
import { usePrefs } from '../lib/prefs';
import type { Team } from '../lib/types';

interface Props {
  team: Team;
  divisionId: string;
  skills: string[];
  onToast: (msg: string) => void;
  onRefresh: () => void;
}

function randomCode(): string {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s.slice(0, 4) + '-' + s.slice(4);
}

export function SettingsScreen({ team, divisionId, skills, onToast, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const prefs = usePrefs();
  const inviteLink = `${window.location.origin}/join/${team.invite_code}`;

  const addSkill = useAddSkill();
  const delSkill = useDeleteSkill();

  const [newSkill, setNewSkill] = useState('');

  const regenerate = async () => {
    setBusy(true);
    const { error } = await supabase.from('teams').update({ invite_code: randomCode() }).eq('id', team.id);
    setBusy(false);
    if (error) { onToast('Failed to regenerate'); return; }
    onRefresh();
    onToast('New invite link generated');
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(inviteLink);
    onToast('Invite link copied');
  };

  const doAddSkill = async () => {
    const n = newSkill.trim();
    if (!n) return;
    try {
      await addSkill.mutateAsync({ divisionId, name: n });
      setNewSkill('');
      onToast(`Skill "${n}" added`);
    } catch (e: any) {
      onToast(e.message ?? 'Failed to add skill');
    }
  };

  const doDelSkill = async (name: string) => {
    try {
      await delSkill.mutateAsync({ divisionId, name });
      onToast(`Skill "${name}" removed`);
    } catch (e: any) {
      onToast(e.message ?? 'Failed to remove skill');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Section title="Team">
        <Field label="Name">{team.name}</Field>
        <Field label="Project">{team.project_name}</Field>
        <Field label="Members">{team.member_count}</Field>
        <Field label="Commanders">{team.commander_count}</Field>
      </Section>

      <Section title="Invite link">
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>
          Anyone with this link can request to join. Per PRD §10, a commander must approve new joiners before the roster becomes visible (approval flow not yet built).
        </div>
        {team.invite_code ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', background: 'var(--paper-deep)',
            border: '1px solid var(--line-soft)', borderRadius: 8,
            fontFamily: 'var(--mono)', fontSize: 13,
          }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{inviteLink}</span>
            <Button size="sm" variant="ghost" icon="copy" onClick={copyLink}>Copy</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={regenerate}>Regenerate</Button>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
            No invite code set for this team.
          </div>
        )}
      </Section>

      <Section title={`Skill tags (${skills.length}) · division-wide`}>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>
          Skills are shared across all teams in this division.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {skills.map((s) => (
            <EditableTag key={s} label={s} onRemove={() => doDelSkill(s)} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="input" placeholder="New skill tag"
                 value={newSkill}
                 onChange={(e) => setNewSkill(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && doAddSkill()}
                 style={{ flex: 1 }} />
          <Button size="sm" variant="primary" icon="plus" disabled={!newSkill.trim() || addSkill.isPending} onClick={doAddSkill}>
            Add skill
          </Button>
        </div>
      </Section>

      <Section title="Display">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
          <div style={{ flex: 1, fontSize: 13 }}>
            Direction
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
              Hebrew uses RTL. PRD §8.3 — codebase RTL-aware from day one.
            </div>
          </div>
          <div className="filter-group">
            <button data-on={prefs.dir === 'ltr' ? '1' : '0'} onClick={() => { prefs.setDir('ltr'); prefs.setLang('en'); }}>LTR / English</button>
            <button data-on={prefs.dir === 'rtl' ? '1' : '0'} onClick={() => { prefs.setDir('rtl'); prefs.setLang('he'); }}>RTL / עברית</button>
          </div>
        </div>
      </Section>

      <Section title="Privacy">
        <Note>
          <Icon name="eyeOff" size={14} />
          <span>
            Phone numbers visible only to commanders. Reviews disabled in MVP v0 (PRD §10).
            Tighten RLS policies before public beta.
          </span>
        </Note>
      </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--card)',
      padding: 18,
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
        textTransform: 'uppercase', letterSpacing: '.08em',
        color: 'var(--ink-mute)', marginBottom: 12,
      }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '4px 0' }}>
      <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', minWidth: 100 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--ink)' }}>{children}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 7,
      background: 'var(--accent-tint)', color: 'var(--accent-ink)',
      border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
      fontSize: 12, lineHeight: 1.5,
      display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      {children}
    </div>
  );
}
