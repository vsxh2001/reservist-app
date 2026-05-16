import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, StatusPill } from './atoms';
import { Icon } from './Icon';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useActiveTeam } from '../lib/team-context';
import type { Status, TeamMembership } from '../lib/types';

const MOCK_FLAG = import.meta.env.VITE_MOCK_AUTH === '1';

interface PickMember {
  id: string;
  name: string;
  initials: string;
  tone: number;
  teams: TeamMembership[];
  status: Status;
}

export function LoginPicker() {
  const { signInWithGoogle, signInAsMock } = useAuth();
  const { setTeamId } = useActiveTeam();
  const [list, setList] = useState<PickMember[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!MOCK_FLAG) return;
    supabase.from('members_view')
      .select('id, name, initials, tone, teams, status')
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
    return list.filter((m) => m.name.toLowerCase().includes(s));
  }, [list, q]);

  const commanders = (filtered ?? []).filter((m) => m.teams.some((t) => t.role === 'commander'));
  const reservists = (filtered ?? []).filter((m) => !m.teams.some((t) => t.role === 'commander'));

  const proceedMock = () => {
    const c = list?.find((x) => x.id === picked);
    if (!c) return;
    signInAsMock({ id: c.id, name: c.name });
    const firstTeamId = c.teams[0]?.team_id;
    if (firstTeamId) setTeamId(firstTeamId);
  };

  const startGoogle = async () => {
    setBusy(true);
    try { await signInWithGoogle(); }
    finally { setBusy(false); }
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
            Sign in to continue.
          </div>
        </div>

        <Button variant="primary" disabled={busy} onClick={startGoogle}
                style={{ width: '100%', justifyContent: 'center', height: 42 }}>
          <GoogleMark/> Continue with Google
        </Button>

        {!MOCK_FLAG && (
          <div style={{
            marginTop: 14, fontSize: 11.5, color: 'var(--ink-soft)',
            textAlign: 'center', lineHeight: 1.5,
          }}>
            First sign-in opens a screen to claim your member profile.
          </div>
        )}

        {MOCK_FLAG && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              margin: '18px 0 14px', color: 'var(--ink-mute)', fontSize: 11,
              fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.08em',
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }}/>
              dev — mock login
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }}/>
            </div>

            <div className="search" style={{ maxWidth: '100%', marginBottom: 10 }}>
              <Icon name="search" size={14} />
              <input placeholder="Search by name or role" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            {list === null ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>Loading…</div>
            ) : list.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
                No members. Did the seed run?
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflow: 'auto', margin: '0 -4px' }}>
                {commanders.length > 0 && <SectionHeader label="Commanders" />}
                <List members={commanders} picked={picked} setPicked={setPicked} />
                {reservists.length > 0 && <SectionHeader label={`Reservists (${reservists.length})`} />}
                <List members={reservists} picked={picked} setPicked={setPicked} />
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="outline" icon="check" disabled={!picked} onClick={proceedMock}>
                Continue as mock
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84c-.21 1.12-.84 2.07-1.79 2.71v2.25h2.9c1.7-1.56 2.69-3.86 2.69-6.61z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.25c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.32A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.95 10.71A5.41 5.41 0 0 1 3.66 9c0-.59.1-1.17.29-1.71V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.32z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.97l2.99 2.32C4.66 5.16 6.65 3.58 9 3.58z"/>
    </svg>
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
      {members.map((m) => {
        const isCommander = m.teams.some((t) => t.role === 'commander');
        return (
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
                {isCommander && <span style={{
                  marginInlineStart: 6, fontSize: 10, padding: '1px 5px',
                  background: 'var(--accent-tint)', color: 'var(--accent-deep)',
                  borderRadius: 3, fontFamily: 'var(--mono)',
                  textTransform: 'uppercase', letterSpacing: '.06em',
                  verticalAlign: 1, fontWeight: 600,
                }}>CMDR</span>}
              </div>
            </div>
            <StatusPill status={m.status} />
          </button>
        );
      })}
    </div>
  );
}
