import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDivisionId, getMemberIdByName, getTeamId, rest, restStatus, supabaseReachable } from './_supabase.js';
import { COMMANDER_AUTH_USER_ID, SOLDIER_AUTH_USER_ID } from './_jwt.js';

describe('Supabase mutation roundtrips', () => {
  let divisionId: string;
  let teamId: string;
  let memberId: string;
  let prevStatus: string;
  let prevNote: string | null;
  let prevUntil: string | null;

  // Eitan Cohen's member id — needed for self-update tests (soldier).
  let eitanId: string;

  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
    divisionId = await getDivisionId();
    teamId = await getTeamId();
    eitanId = await getMemberIdByName('Eitan Cohen');
    memberId = eitanId;
    const before = await rest<{ status: string; status_note: string | null; status_until: string | null }[]>(
      `/members?id=eq.${memberId}&select=status,status_note,status_until`,
      { as: { asServiceRole: true } },
    );
    prevStatus = before[0].status;
    prevNote = before[0].status_note;
    prevUntil = before[0].status_until;
  });

  afterAll(async () => {
    // Restore via service role (bypasses RLS — clean-up always succeeds).
    await rest(`/members?id=eq.${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: prevStatus, status_note: prevNote, status_until: prevUntil }),
      as: { asServiceRole: true },
    });
  });

  it('status update + readback (soldier updating own status)', async () => {
    // Eitan Cohen is the seeded soldier; his auth_user_id = SOLDIER_AUTH_USER_ID.
    await rest(`/members?id=eq.${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'standby', status_note: 'integration test', status_until: '2026-07-01' }),
      as: { asAuthUserId: SOLDIER_AUTH_USER_ID },
    });
    const after = await rest<{ status: string; status_note: string; status_until: string }[]>(
      `/members?id=eq.${memberId}&select=status,status_note,status_until`,
      { as: { asAuthUserId: SOLDIER_AUTH_USER_ID } },
    );
    expect(after[0].status).toBe('standby');
    expect(after[0].status_note).toBe('integration test');
    expect(after[0].status_until).toBe('2026-07-01');
  });

  it('members_view reflects status change (soldier can read own division)', async () => {
    const after = await rest<{ status: string }[]>(
      `/members_view?id=eq.${memberId}&select=status`,
      { as: { asAuthUserId: SOLDIER_AUTH_USER_ID } },
    );
    expect(after[0].status).toBe('standby');
  });

  it('join_request CRUD (create by anon → list by commander → delete by commander)', async () => {
    // Anon insert is kept — this is the join entry point.
    // Cannot use prefer=return=representation because anon has no SELECT policy.
    const r = await restStatus('/join_requests', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        team_id: teamId,
        name: 'Test Joiner',
        phone: '+972 50-000-9999',
        skill_names: ['Urban Combat', 'Night Ops'],
      }),
      as: { asAnon: true },
    });
    expect(r.status).toBeLessThan(300);

    // Commander finds the created row.
    const found = await rest<{ id: string }[]>(
      `/join_requests?team_id=eq.${teamId}&name=eq.Test+Joiner&select=id`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    expect(found.length).toBeGreaterThan(0);
    const id = found[0].id;
    expect(id).toBeTruthy();

    // Commander reads the join request.
    const list = await rest<{ name: string; state: string }[]>(
      `/join_requests?id=eq.${id}&select=name,state`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    expect(list[0].name).toBe('Test Joiner');
    expect(list[0].state).toBe('pending');

    // Commander deletes it.
    await rest(`/join_requests?id=eq.${id}`, {
      method: 'DELETE',
      as: { asAuthUserId: COMMANDER_AUTH_USER_ID },
    });
    const after = await rest<unknown[]>(
      `/join_requests?id=eq.${id}&select=id`,
      { as: { asServiceRole: true } },
    );
    expect(after.length).toBe(0);
  });

  it('slot creation with skill+min_level (create → verify view → cleanup) — commander', async () => {
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
      as: { asAuthUserId: COMMANDER_AUTH_USER_ID },
    });
    const slotId = slotRow[0].id;

    const sk = await rest<{ id: string }[]>(
      `/skills?division_id=eq.${divisionId}&name=eq.Sniper%20Cert.&select=id`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    const skillId = sk[0].id;

    await rest('/slot_skills', {
      method: 'POST',
      body: JSON.stringify({ slot_id: slotId, skill_id: skillId, min_level: 'senior' }),
      as: { asAuthUserId: COMMANDER_AUTH_USER_ID },
    });

    const view = await rest<{ skills: { name: string; min_level: string }[] }[]>(
      `/slots_view?id=eq.${slotId}&select=skills`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    const sniper = view[0].skills.find((s) => s.name === 'Sniper Cert.');
    expect(sniper?.min_level).toBe('senior');

    // Cleanup (commander can delete slots they created)
    await rest(`/slots?id=eq.${slotId}`, {
      method: 'DELETE',
      as: { asAuthUserId: COMMANDER_AUTH_USER_ID },
    });
    const after = await rest<unknown[]>(
      `/slots?id=eq.${slotId}&select=id`,
      { as: { asServiceRole: true } },
    );
    expect(after.length).toBe(0);
  });

  it('activity_log insert is readable (commander inserts, commander reads)', async () => {
    // Clean up any lingering test rows first.
    const before = await rest<{ id: string }[]>(
      `/activity_log?team_id=eq.${teamId}&verb=eq.integration%20test&select=id`,
      { as: { asServiceRole: true } },
    );
    for (const r of before) {
      await rest(`/activity_log?id=eq.${r.id}`, { method: 'DELETE', as: { asServiceRole: true } });
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
      as: { asAuthUserId: COMMANDER_AUTH_USER_ID },
    });
    const after = await rest<{ actor_name: string; what: string }[]>(
      `/activity_log?team_id=eq.${teamId}&verb=eq.integration%20test&select=actor_name,what`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    expect(after.length).toBe(1);
    expect(after[0].actor_name).toBe('vitest');
    expect(after[0].what).toBe('roundtrip');
    // Cleanup (admin delete via service role since activity_log delete requires admin)
    await rest(`/activity_log?team_id=eq.${teamId}&verb=eq.integration%20test`, {
      method: 'DELETE',
      as: { asServiceRole: true },
    });
  });

  it('team_members round-trip: remove + count + re-add (commander)', async () => {
    const target = await getMemberIdByName('Shai Klein');

    const before = await rest<{ role: string }[]>(
      `/team_members?team_id=eq.${teamId}&member_id=eq.${target}&select=role`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    expect(before.length).toBe(1);
    const originalRole = before[0].role;

    // Capture baseline count using team_members directly (avoids view caching).
    const baselineRows = await rest<{ member_id: string }[]>(
      `/team_members?team_id=eq.${teamId}&select=member_id`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    const baselineCount = baselineRows.length;

    try {
      await rest(`/team_members?team_id=eq.${teamId}&member_id=eq.${target}`, {
        method: 'DELETE',
        as: { asAuthUserId: COMMANDER_AUTH_USER_ID },
      });
      const afterDeleteRows = await rest<{ member_id: string }[]>(
        `/team_members?team_id=eq.${teamId}&select=member_id`,
        { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
      );
      // Should be exactly one less than baseline.
      expect(afterDeleteRows.length).toBe(baselineCount - 1);
    } finally {
      // Restore original membership
      await rest('/team_members', {
        method: 'POST',
        body: JSON.stringify({ team_id: teamId, member_id: target, role: originalRole }),
        as: { asAuthUserId: COMMANDER_AUTH_USER_ID },
      });
    }
    const afterRestoreRows = await rest<{ member_id: string }[]>(
      `/team_members?team_id=eq.${teamId}&select=member_id`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    // Should be back to baseline.
    expect(afterRestoreRows.length).toBe(baselineCount);
  });
});
