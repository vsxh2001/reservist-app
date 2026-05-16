import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDivisionId, getMemberIdByName, getTeamId, rest, supabaseReachable } from './_supabase';

describe('Supabase mutation roundtrips', () => {
  let divisionId: string;
  let teamId: string;
  let memberId: string;
  let prevStatus: string;
  let prevNote: string | null;
  let prevUntil: string | null;

  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
    divisionId = await getDivisionId();
    teamId = await getTeamId();
    memberId = await getMemberIdByName('Eitan Cohen');
    const before = await rest<{ status: string; status_note: string | null; status_until: string | null }[]>(
      `/members?id=eq.${memberId}&select=status,status_note,status_until`,
    );
    prevStatus = before[0].status;
    prevNote = before[0].status_note;
    prevUntil = before[0].status_until;
  });

  afterAll(async () => {
    await rest(`/members?id=eq.${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: prevStatus, status_note: prevNote, status_until: prevUntil }),
    });
  });

  it('status update + readback', async () => {
    await rest(`/members?id=eq.${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'standby', status_note: 'integration test', status_until: '2026-07-01' }),
    });
    const after = await rest<{ status: string; status_note: string; status_until: string }[]>(
      `/members?id=eq.${memberId}&select=status,status_note,status_until`,
    );
    expect(after[0].status).toBe('standby');
    expect(after[0].status_note).toBe('integration test');
    expect(after[0].status_until).toBe('2026-07-01');
  });

  it('members_view reflects status change', async () => {
    const after = await rest<{ status: string }[]>(`/members_view?id=eq.${memberId}&select=status`);
    expect(after[0].status).toBe('standby');
  });

  it('join_request CRUD (create → list → delete)', async () => {
    const created = await rest<{ id: string }[]>('/join_requests', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        team_id: teamId,
        name: 'Test Joiner',
        phone: '+972 50-000-9999',
        skill_names: ['Urban Combat', 'Night Ops'],
      }),
    });
    const id = created[0].id;
    expect(id).toBeTruthy();

    const list = await rest<{ name: string; state: string }[]>(
      `/join_requests?id=eq.${id}&select=name,state`,
    );
    expect(list[0].name).toBe('Test Joiner');
    expect(list[0].state).toBe('pending');

    await rest(`/join_requests?id=eq.${id}`, { method: 'DELETE' });
    const after = await rest<unknown[]>(`/join_requests?id=eq.${id}&select=id`);
    expect(after.length).toBe(0);
  });

  it('slot creation with skill+min_level (create → verify view → cleanup)', async () => {
    const slotRow = await rest<{ id: string }[]>('/slots', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        team_id: teamId,
        title: 'Integration test slot',
        urgent: false,
        state: 'draft',
        start_at: '2030-01-01T10:00:00Z',
        end_at:   '2030-01-01T14:00:00Z',
        duration: '4h',
        location: 'Test base',
        needed: 1,
      }),
    });
    const slotId = slotRow[0].id;

    const sk = await rest<{ id: string }[]>(
      `/skills?division_id=eq.${divisionId}&name=eq.Sniper%20Cert.&select=id`,
    );
    const skillId = sk[0].id;

    await rest('/slot_skills', {
      method: 'POST',
      body: JSON.stringify({ slot_id: slotId, skill_id: skillId, min_level: 'senior' }),
    });

    const view = await rest<{ skills: { name: string; min_level: string }[] }[]>(
      `/slots_view?id=eq.${slotId}&select=skills`,
    );
    const sniper = view[0].skills.find((s) => s.name === 'Sniper Cert.');
    expect(sniper?.min_level).toBe('senior');

    // Cleanup
    await rest(`/slots?id=eq.${slotId}`, { method: 'DELETE' });
    const after = await rest<unknown[]>(`/slots?id=eq.${slotId}&select=id`);
    expect(after.length).toBe(0);
  });

  it('activity_log insert is readable', async () => {
    const before = await rest<{ id: string }[]>(
      `/activity_log?team_id=eq.${teamId}&verb=eq.integration%20test&select=id`,
    );
    for (const r of before) {
      await rest(`/activity_log?id=eq.${r.id}`, { method: 'DELETE' });
    }
    await rest('/activity_log', {
      method: 'POST',
      body: JSON.stringify({
        team_id: teamId,
        actor_name: 'vitest',
        verb: 'integration test',
        what: 'roundtrip',
        tone: 'accent',
      }),
    });
    const after = await rest<{ actor_name: string; what: string }[]>(
      `/activity_log?team_id=eq.${teamId}&verb=eq.integration%20test&select=actor_name,what`,
    );
    expect(after.length).toBe(1);
    expect(after[0].actor_name).toBe('vitest');
    expect(after[0].what).toBe('roundtrip');
    // Cleanup
    await rest(`/activity_log?team_id=eq.${teamId}&verb=eq.integration%20test`, { method: 'DELETE' });
  });

  it('team_members round-trip: remove + count + re-add', async () => {
    // Pick a seeded soldier; remove from team, verify count drop, re-add.
    const target = await getMemberIdByName('Shai Klein');

    // Capture original role
    const before = await rest<{ role: string }[]>(
      `/team_members?team_id=eq.${teamId}&member_id=eq.${target}&select=role`,
    );
    expect(before.length).toBe(1);
    const originalRole = before[0].role;

    try {
      await rest(`/team_members?team_id=eq.${teamId}&member_id=eq.${target}`, { method: 'DELETE' });
      const rows = await rest<{ member_count: number }[]>(
        `/teams_view?id=eq.${teamId}&select=member_count`,
      );
      expect(rows[0].member_count).toBe(23);
    } finally {
      // Restore original membership
      await rest('/team_members', {
        method: 'POST',
        body: JSON.stringify({ team_id: teamId, member_id: target, role: originalRole }),
      });
    }
    const after = await rest<{ member_count: number }[]>(
      `/teams_view?id=eq.${teamId}&select=member_count`,
    );
    expect(after[0].member_count).toBe(24);
  });
});
