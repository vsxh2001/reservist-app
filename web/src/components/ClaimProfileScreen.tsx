import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, StatusPill } from './atoms';
import { Icon } from './Icon';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Status } from '../lib/types';

interface PickMember {
  id: string;
  name: string;
  initials: string;
  tone: number;
  is_commander: boolean;
  status: Status;
  auth_user_id: string | null;
}

export function ClaimProfileScreen() {
  const { authUser, signOut, refreshLink } = useAuth();
  const [list, setList] = useState<PickMember[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('members_view')
      .select('id, name, initials, tone, is_commander, status, auth_user_id')
      .order('is_commander', { ascending: false })
      .order('name')
      .then(({ data, error: e }) => {
        if (e) console.error(e);
        setList(((data as PickMember[]) ?? []).filter((m) => !m.auth_user_id));
      });
  }, []);

  const filtered = useMemo(() => {
    if (!list) return null;
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((m) => m.name.toLowerCase().includes(s));
  }, [list, q]);

  const claim = async () => {
    if (!picked || !authUser) return;
    setBusy(true);
    setError(null);
    const { error: updErr } = await supabase
      .from('members')
      .update({
        auth_user_id: authUser.id,
        email: authUser.email ?? null,
      })
      .eq('id', picked)
      .is('auth_user_id', null); // race guard
    setBusy(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    await refreshLink();
  };

  const googleName = (authUser?.user_metadata?.full_name as string | undefined)
    ?? (authUser?.user_metadata?.name as string | undefined)
    ?? authUser?.email
    ?? 'signed-in user';

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
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <h1 style={{
            fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 400,
            margin: '0 0 4px', letterSpacing: '-.01em',
          }}>Claim your <em style={{ color: 'var(--ink-soft)' }}>profile</em></h1>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            Signed in as <b>{googleName}</b>. Pick the unit member that is you. This is a one-time link — the commander can re-assign it later.
          </div>
        </div>

        <div className="search" style={{ maxWidth: '100%', marginBottom: 10 }}>
          <Icon name="search" size={14} />
          <input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {list === null ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>Loading…</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
            All members are already linked. Ask a commander to invite you.
          </div>
        ) : (
          <div style={{ maxHeight: 360, overflow: 'auto', margin: '0 -4px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 4px' }}>
              {(filtered ?? []).map((m) => (
                <button key={m.id} onClick={() => setPicked(m.id)} style={{
                  appearance: 'none', textAlign: 'start',
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
                        marginInlineStart: 6, fontSize: 10, padding: '1px 5px',
                        background: 'var(--accent-tint)', color: 'var(--accent-deep)',
                        borderRadius: 3, fontFamily: 'var(--mono)',
                        textTransform: 'uppercase', letterSpacing: '.06em',
                        fontWeight: 600,
                      }}>CMDR</span>}
                    </div>
                  </div>
                  <StatusPill status={m.status} />
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            marginBlockStart: 10, padding: '8px 10px',
            background: 'var(--urgent-bg)', color: 'var(--urgent-deep)',
            borderRadius: 8, fontSize: 12,
          }}>{error}</div>
        )}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <Button variant="ghost" onClick={() => { void signOut(); }}>Sign out</Button>
          <Button variant="primary" icon="check" disabled={!picked || busy} onClick={claim}>
            Claim
          </Button>
        </div>
      </div>
    </div>
  );
}
