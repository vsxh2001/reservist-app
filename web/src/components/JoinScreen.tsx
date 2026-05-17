import { useEffect, useMemo, useState } from 'react';
import { Button } from './atoms';
import { Icon } from './Icon';
import { supabase } from '../lib/supabase';
import { useInspectInvite, useSubmitJoinRequest } from '../lib/queries';

interface Props {
  code: string;
  onCancel: () => void;
}

interface TeamMeta {
  skills: string[];
}

export function JoinScreen({ code, onCancel }: Props) {
  const invite = useInspectInvite(code);
  const submit = useSubmitJoinRequest();
  const [meta, setMeta] = useState<TeamMeta | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const divisionId = invite.data?.division_id;
    if (!divisionId) return;
    (async () => {
      const s = await supabase.from('skills').select('name').eq('division_id', divisionId).order('name');
      setMeta({
        skills: (s.data ?? []).map((x: any) => x.name),
      });
    })();
  }, [invite.data]);

  const teamId = invite.data?.status === 'valid' ? invite.data.team_id : null;
  const teamName = invite.data?.team_name ?? null;

  const canSubmit = useMemo(
    () => name.trim().length > 1 && phone.trim().length >= 7 && !!teamId,
    [name, phone, teamId],
  );

  const doSubmit = async () => {
    if (!teamId) return;
    setSubmitError(null);
    try {
      await submit.mutateAsync({
        teamId,
        name: name.trim(),
        phone: phone.trim(),
        skillNames: skills,
        note: note.trim() || null,
      });
      setSent(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(`Couldn't send request: ${message}`);
    }
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', placeItems: 'center',
      background: 'var(--paper)',
      padding: 40, overflow: 'auto',
    }}>
      <div style={{
        width: 460, maxWidth: '100%',
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        padding: 28,
        boxShadow: 'var(--shadow-md)',
      }}>
        {invite.isLoading ? (
          <div style={{ color: 'var(--ink-soft)' }}>Loading invite…</div>
        ) : invite.data?.status === 'not_found' ? (
          <>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, margin: '0 0 6px' }}>Invite not found</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
              Code <code>{code}</code> didn't match any team. Ask a commander for a fresh link.
            </p>
            <Button variant="outline" onClick={onCancel}>Back</Button>
          </>
        ) : invite.data?.status === 'expired' ? (
          <>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase',
                          letterSpacing: '.08em', color: 'var(--ink-mute)' }}>Invite expired</div>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, margin: '4px 0 6px' }}>
              {teamName}
            </h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.5 }}>
              This invite link has expired. Ask your commander to regenerate or renew the team's invite link, then try again.
            </p>
            <Button variant="outline" onClick={onCancel}>Back</Button>
          </>
        ) : sent ? (
          <>
            <div style={{
              display: 'inline-grid', placeItems: 'center',
              width: 56, height: 56, borderRadius: 12,
              background: 'var(--accent)', color: 'var(--card)',
              marginBottom: 12,
            }}><Icon name="check" size={28} stroke={2} /></div>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, margin: '0 0 6px' }}>Request sent</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.5 }}>
              A commander of <b>{teamName}</b> will review your request. You'll get a notification once approved (PRD §10 risk 3 — no roster visibility until then).
            </p>
            <Button variant="outline" onClick={onCancel}>Back</Button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase',
                            letterSpacing: '.08em', color: 'var(--ink-mute)' }}>Join team</div>
              <h2 style={{ fontFamily: 'var(--serif)', fontSize: 26, margin: '4px 0 0', fontWeight: 400, letterSpacing: '-.01em' }}>
                {teamName}
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Row label="Full name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                       placeholder="e.g. Tamar Levi" autoComplete="name" />
              </Row>
              <Row label="Phone">
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)}
                       placeholder="+972 50-000-0000" autoComplete="tel" type="tel" />
              </Row>
              <Row label="Skills">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {(meta?.skills ?? []).map((s) => {
                    const on = skills.includes(s);
                    return (
                      <button key={s}
                              type="button"
                              onClick={() => setSkills((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])}
                              style={{
                                appearance: 'none', font: 'inherit',
                                fontSize: 11, padding: '4px 8px', borderRadius: 4,
                                border: '1px solid ' + (on ? 'var(--accent)' : 'var(--line)'),
                                background: on ? 'var(--accent-tint)' : 'var(--card)',
                                color: on ? 'var(--accent-deep)' : 'var(--ink-2)',
                                cursor: 'pointer', fontWeight: 500,
                              }}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </Row>
              <Row label="Note (optional)">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)}
                       placeholder="Anything the commander should know" />
              </Row>

              <div style={{
                padding: '8px 10px', borderRadius: 7,
                background: 'var(--accent-tint)', color: 'var(--accent-ink)',
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                fontSize: 11.5, lineHeight: 1.5,
                display: 'flex', gap: 6,
              }}>
                <Icon name="shield" size={13} />
                <span>
                  Don't enter classified info. Per PRD §10 risk 4: this is unofficial; operational details belong off-platform.
                </span>
              </div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
              <Button variant="primary" icon="check"
                      disabled={!canSubmit || submit.isPending}
                      onClick={doSubmit}>
                Send request
              </Button>
            </div>
            {submitError && (
              <div role="alert" style={{
                marginTop: 10,
                padding: '8px 10px', borderRadius: 7,
                background: 'var(--urgent-bg)', color: 'var(--urgent-deep)',
                border: '1px solid var(--urgent)',
                fontSize: 12, lineHeight: 1.4,
              }}>
                {submitError}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}
