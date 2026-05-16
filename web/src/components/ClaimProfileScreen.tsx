import { useMemo, useState } from 'react';
import { Avatar, Button } from './atoms';
import { Icon } from './Icon';
import { useAuth } from '../lib/auth';
import { useClaimMemberByInvite, useUnclaimedMembersByInvite } from '../lib/queries';

interface Props {
  /**
   * Pre-filled invite code (e.g. resolved from a /join/<code> URL the user
   * arrived from). When set, the invite-code input is hidden and the list
   * loads immediately.
   */
  initialInviteCode?: string | null;
}

export function ClaimProfileScreen({ initialInviteCode = null }: Props) {
  const { authUser, signOut, refreshLink } = useAuth();
  const [codeInput, setCodeInput] = useState(initialInviteCode ?? '');
  const [submittedCode, setSubmittedCode] = useState<string | null>(
    initialInviteCode && initialInviteCode.trim().length > 0 ? initialInviteCode.trim() : null,
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const list = useUnclaimedMembersByInvite(submittedCode);
  const claim = useClaimMemberByInvite();

  const filtered = useMemo(() => {
    const data = list.data;
    if (!data) return null;
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((m) => m.name.toLowerCase().includes(s));
  }, [list.data, q]);

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = codeInput.trim();
    setError(null);
    setPicked(null);
    setSubmittedCode(trimmed.length > 0 ? trimmed : null);
  };

  const doClaim = async () => {
    if (!picked || !submittedCode || !authUser) return;
    setError(null);
    try {
      await claim.mutateAsync({
        memberId: picked,
        inviteCode: submittedCode,
        email: authUser.email ?? null,
      });
      await refreshLink();
    } catch (err) {
      // Supabase throws plain objects with a `message` field (PostgrestError),
      // not Error instances. Coerce both shapes into a readable string.
      const message =
        err instanceof Error
          ? err.message
          : (err && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Claim failed');
      setError(message);
    }
  };

  const googleName = (authUser?.user_metadata?.full_name as string | undefined)
    ?? (authUser?.user_metadata?.name as string | undefined)
    ?? authUser?.email
    ?? 'signed-in user';

  const listLoaded = list.data !== undefined;
  const hasResults = !!list.data && list.data.length > 0;
  const showList = !!submittedCode;

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
            Signed in as <b>{googleName}</b>. Enter your team invite code, then pick the
            unit member that is you. This is a one-time link — the commander can re-assign it later.
          </div>
        </div>

        <form onSubmit={submitCode} style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>
            Team invite code
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="e.g. carmel-6-J3xK"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 10px',
                border: '1px solid var(--line-strong)',
                borderRadius: 8,
                font: 'inherit',
                background: 'var(--card)',
                color: 'inherit',
              }}
            />
            <Button variant="primary" disabled={codeInput.trim().length === 0}>
              Look up
            </Button>
          </div>
        </form>

        {showList && (
          <>
            <div className="search" style={{ maxWidth: '100%', marginBottom: 10 }}>
              <Icon name="search" size={14} />
              <input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            {list.isLoading || !listLoaded ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>Loading…</div>
            ) : list.error ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
                Couldn't look up that invite code. Check it and try again.
              </div>
            ) : !hasResults ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
                No unclaimed members for that invite code. Ask a commander to invite you.
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
                      <Avatar initials={m.initials} tone={m.tone} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>
                          {m.name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
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
          <Button
            variant="primary"
            icon="check"
            disabled={!picked || claim.isPending || !submittedCode}
            onClick={doClaim}
          >
            Claim
          </Button>
        </div>
      </div>
    </div>
  );
}
