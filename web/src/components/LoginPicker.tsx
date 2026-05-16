import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, StatusPill } from './atoms';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Status } from '../lib/types';

interface PickMember {
  id: string;
  name: string;
  initials: string;
  tone: number;
  is_commander: boolean;
  role: string | null;
  status: Status;
}

export function LoginPicker() {
  const [list, setList] = useState<PickMember[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const { login } = useAuth();

  useEffect(() => {
    supabase.from('members_view')
      .select('id, name, initials, tone, is_commander, role, status')
      .order('is_commander', { ascending: false })
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error(error);
        setList((data as PickMember[]) ?? []);
      });
  }, []);

  const filtered = useMemo(() => {
    if (!list) return null;
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((m) => m.name.toLowerCase().includes(s) || (m.role ?? '').toLowerCase().includes(s));
  }, [list, q]);

  const commanders = (filtered ?? []).filter((m) => m.is_commander);
  const reservists = (filtered ?? []).filter((m) => !m.is_commander);

  const proceed = () => {
    const c = list?.find((x) => x.id === picked);
    if (c) login({ id: c.id, name: c.name });
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', placeItems: 'center',
      background: 'var(--paper)',
      padding: 24, overflow: 'auto',
    }}>
      <div style={{
        width: 480, maxWidth: '100%',
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        padding: 24,
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{
            display: 'inline-grid', placeItems: 'center',
            width: 56, height: 56,
            background: 'var(--accent)', color: 'var(--accent-soft)',
            borderRadius: 12, fontFamily: 'var(--serif)',
            fontSize: 32, fontStyle: 'italic', letterSpacing: '-.03em',
            marginBottom: 14,
          }}>M6</div>
          <h1 style={{
            fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 400,
            margin: '0 0 4px', letterSpacing: '-.01em',
          }}>Mahlaka 6 — <em style={{ color: 'var(--ink-soft)' }}>Carmel</em></h1>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
            Pick yourself to continue (mock login — real OTP coming).
          </div>
        </div>

        <div className="search" style={{ maxWidth: '100%', marginBottom: 10 }}>
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}
               strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-mute)' }}>
            <circle cx="7.5" cy="7.5" r="4.8"/><path d="M11 11l3 3"/>
          </svg>
          <input placeholder="Search by name or role" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {list === null ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>Loading…</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
            No members. Did the seed run?
          </div>
        ) : (
          <div style={{ maxHeight: 420, overflow: 'auto', margin: '0 -4px' }}>
            {commanders.length > 0 && <SectionHeader label="Commanders" />}
            <List members={commanders} picked={picked} setPicked={setPicked} />
            {reservists.length > 0 && <SectionHeader label={`Reservists (${reservists.length})`} />}
            <List members={reservists} picked={picked} setPicked={setPicked} />
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" icon="check" disabled={!picked} onClick={proceed}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: '10px 6px 6px',
      fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
      textTransform: 'uppercase', letterSpacing: '.08em',
      color: 'var(--ink-mute)',
    }}>{label}</div>
  );
}

function List({ members, picked, setPicked }: { members: PickMember[]; picked: string | null; setPicked: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 4px' }}>
      {members.map((m) => (
        <button key={m.id} onClick={() => setPicked(m.id)} style={{
          appearance: 'none', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 12px',
          background: m.id === picked ? 'var(--accent-tint)' : 'var(--card)',
          border: '1px solid ' + (m.id === picked ? 'var(--accent)' : 'var(--line-strong)'),
          borderRadius: 8, cursor: 'pointer',
          font: 'inherit',
        }}>
          <Avatar initials={m.initials} tone={m.tone} status={m.status} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>
              {m.name}
              {m.is_commander && <span style={{
                marginLeft: 6, fontSize: 10, padding: '1px 5px',
                background: 'var(--accent-tint)', color: 'var(--accent-deep)',
                borderRadius: 3, fontFamily: 'var(--mono)',
                textTransform: 'uppercase', letterSpacing: '.06em',
                verticalAlign: 1, fontWeight: 600,
              }}>CMDR</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)' }}>{m.role ?? 'No role'}</div>
          </div>
          <StatusPill status={m.status} />
        </button>
      ))}
    </div>
  );
}
