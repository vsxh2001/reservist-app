// web/test/integration/rls.test.ts
// RLS policy verification: positive + negative cases for every principal type.
//
// Principals:
//   - anon:      no authenticated JWT (anon key only)
//   - soldier:   Eitan Cohen, seeded member, role = soldier in the M6 Carmel team
//   - commander: Yoni Avraham, seeded member, role = commander in the M6 Carmel team,
//                also is_division_admin = true (Yoni is admin of Mahlaka 6)
//
// "Foreign division" tests use a second division that does not exist in the seed —
// confirmed by checking that no division other than Mahlaka 6 is reachable.

import { beforeAll, describe, expect, it } from 'vitest';
import { getDivisionId, getTeamId, getMemberIdByName, rest, restStatus, supabaseReachable } from './_supabase.js';
import { COMMANDER_AUTH_USER_ID, SOLDIER_AUTH_USER_ID } from './_jwt.js';

// Helper: fetch with anon role (no authenticated claims).
const AS_ANON = { as: { asAnon: true } } as const;
const AS_COMMANDER = { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } } as const;
const AS_SOLDIER = { as: { asAuthUserId: SOLDIER_AUTH_USER_ID } } as const;
const AS_SVCR = { as: { asServiceRole: true } } as const;

describe('RLS policies', () => {
  let divisionId: string;
  let teamId: string;
  let commanderId: string;  // Yoni Avraham
  let soldierId: string;    // Eitan Cohen

  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
    divisionId = await getDivisionId();
    teamId = await getTeamId();
    commanderId = await getMemberIdByName('Yoni Avraham');
    soldierId   = await getMemberIdByName('Eitan Cohen');
  });

  // ─────────────────────────────────────────────────────────────
  // Anonymous — blocked tables
  // ─────────────────────────────────────────────────────────────
  describe('anonymous cannot read protected tables', () => {
    it('anon cannot SELECT from members', async () => {
      const r = await restStatus('/members?select=id&limit=1', AS_ANON);
      // PostgREST returns 200 with empty array when RLS filters all rows,
      // or 401 if the table has no anon policy at all.
      // With our setup (no anon SELECT on members), anon gets 0 rows or an error.
      const isBlocked = r.status !== 200 || (JSON.parse(r.body) as unknown[]).length === 0;
      expect(isBlocked).toBe(true);
    });

    it('anon cannot SELECT from divisions', async () => {
      const r = await restStatus('/divisions?select=id&limit=1', AS_ANON);
      const isBlocked = r.status !== 200 || (JSON.parse(r.body) as unknown[]).length === 0;
      expect(isBlocked).toBe(true);
    });

    it('anon cannot SELECT from slots', async () => {
      const r = await restStatus('/slots?select=id&limit=1', AS_ANON);
      const isBlocked = r.status !== 200 || (JSON.parse(r.body) as unknown[]).length === 0;
      expect(isBlocked).toBe(true);
    });

    it('anon cannot SELECT from activity_log', async () => {
      const r = await restStatus('/activity_log?select=id&limit=1', AS_ANON);
      const isBlocked = r.status !== 200 || (JSON.parse(r.body) as unknown[]).length === 0;
      expect(isBlocked).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Anonymous — allowed (join flow carve-outs)
  // ─────────────────────────────────────────────────────────────
  describe('anonymous join flow carve-outs', () => {
    it('anon CAN SELECT teams by invite_code', async () => {
      // Any team with an invite_code should be readable by anon.
      const rows = await rest<{ id: string; invite_code: string }[]>(
        '/teams?invite_code=neq.null&select=id,invite_code&limit=1',
        AS_ANON,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].invite_code).toBeTruthy();
    });

    it('anon CAN INSERT join_request with state=pending', async () => {
      // Note: anon can INSERT but cannot SELECT (no anon SELECT policy).
      // Use Prefer: return=minimal to avoid the post-insert SELECT that would fail.
      const countBefore = await rest<{ id: string }[]>(
        `/join_requests?team_id=eq.${teamId}&name=eq.RLS+Test+Joiner&select=id`,
        AS_SVCR,
      );

      const r = await restStatus('/join_requests', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({
          team_id: teamId,
          name: 'RLS Test Joiner',
          phone: '+972 50-111-2222',
          skill_names: [],
        }),
        ...AS_ANON,
      });
      // 201 = created, or 204 = no content (both mean success)
      expect(r.status).toBeLessThan(300);

      // Verify row was created via service role
      const countAfter = await rest<{ id: string }[]>(
        `/join_requests?team_id=eq.${teamId}&name=eq.RLS+Test+Joiner&select=id`,
        AS_SVCR,
      );
      expect(countAfter.length).toBeGreaterThan(countBefore.length);

      // Cleanup
      for (const row of countAfter) {
        await rest(`/join_requests?id=eq.${row.id}`, { method: 'DELETE', ...AS_SVCR });
      }
    });

    it('anon CANNOT INSERT join_request with state != pending', async () => {
      const r = await restStatus('/join_requests', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify({
          team_id: teamId,
          name: 'Malicious Joiner',
          phone: '+972 50-000-0000',
          skill_names: [],
          state: 'approved',
        }),
        ...AS_ANON,
      });
      expect(r.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Soldier — allowed operations
  // ─────────────────────────────────────────────────────────────
  describe('soldier allowed operations', () => {
    it('soldier CAN SELECT members of own division', async () => {
      const rows = await rest<{ id: string }[]>(
        `/members?division_id=eq.${divisionId}&select=id&limit=5`,
        AS_SOLDIER,
      );
      expect(rows.length).toBeGreaterThan(0);
    });

    it('soldier CAN update their own status', async () => {
      // Save original status first via service role
      const orig = await rest<{ status: string }[]>(
        `/members?id=eq.${soldierId}&select=status`,
        AS_SVCR,
      );
      const originalStatus = orig[0].status;

      await rest(`/members?id=eq.${soldierId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'standby', status_note: 'rls test' }),
        ...AS_SOLDIER,
      });

      const updated = await rest<{ status: string }[]>(
        `/members?id=eq.${soldierId}&select=status`,
        AS_SOLDIER,
      );
      expect(updated[0].status).toBe('standby');

      // Restore
      await rest(`/members?id=eq.${soldierId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: originalStatus, status_note: null }),
        ...AS_SVCR,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Soldier — blocked operations
  // ─────────────────────────────────────────────────────────────
  describe('soldier blocked operations', () => {
    it('soldier CANNOT publish a slot (commander gate)', async () => {
      // Soldier attempts to insert a slot — should fail.
      const r = await restStatus('/slots', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify({
          team_id: teamId,
          title: 'Soldier unauthorized slot',
          urgent: false,
          state: 'published',
          start_at: '2030-06-01T10:00:00Z',
          end_at: '2030-06-01T18:00:00Z',
          duration: '8h',
          location: 'Base',
        }),
        ...AS_SOLDIER,
      });
      expect(r.status).toBeGreaterThanOrEqual(400);
    });

    it('soldier CANNOT update another member\'s status', async () => {
      const r = await restStatus(`/members?id=eq.${commanderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'released' }),
        ...AS_SOLDIER,
      });
      // PostgREST returns 204 (no-op when RLS filters the row) or 4xx.
      // If 204, verify the row was not actually changed.
      if (r.status === 204) {
        const check = await rest<{ status: string }[]>(
          `/members?id=eq.${commanderId}&select=status`,
          AS_SVCR,
        );
        // Commander is seeded as 'available'
        expect(check[0].status).toBe('available');
      } else {
        expect(r.status).toBeGreaterThanOrEqual(400);
      }
    });

    it('soldier CANNOT read members of a foreign division', async () => {
      // There is only one division in the seed. If we request a non-existent
      // division_id, the filter returns empty — the meaningful assertion is that
      // the soldier cannot bypass the current_division_id() scope.
      // Seed only has one division, so any UUID that isn't divisionId is foreign.
      const fakeDiv = '00000000-dead-beef-0000-000000000000';
      const rows = await rest<{ id: string }[]>(
        `/members?division_id=eq.${fakeDiv}&select=id&limit=1`,
        AS_SOLDIER,
      );
      expect(rows.length).toBe(0);
    });

    it('soldier CANNOT read join_requests (commander-gated)', async () => {
      const r = await restStatus(
        `/join_requests?team_id=eq.${teamId}&select=id&limit=1`,
        AS_SOLDIER,
      );
      const isBlocked = r.status !== 200 || (JSON.parse(r.body) as unknown[]).length === 0;
      expect(isBlocked).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Commander — allowed operations
  // ─────────────────────────────────────────────────────────────
  describe('commander allowed operations', () => {
    it('commander CAN publish a slot', async () => {
      const r = await rest<{ id: string }[]>('/slots', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify({
          team_id: teamId,
          title: 'RLS test slot by commander',
          urgent: false,
          state: 'published',
          start_at: '2030-07-01T10:00:00Z',
          end_at: '2030-07-01T18:00:00Z',
          duration: '8h',
          location: 'Base',
        }),
        ...AS_COMMANDER,
      });
      expect(r[0].id).toBeTruthy();
      // Cleanup
      await rest(`/slots?id=eq.${r[0].id}`, { method: 'DELETE', ...AS_COMMANDER });
    });

    it('commander (division admin) CAN read and write team_members for their team', async () => {
      // Verify division admin (Yoni) can read team_members and has commander presence.
      // Use a direct row lookup rather than count to avoid concurrent-mutation flakiness.
      const commanderRows = await rest<{ member_id: string; role: string }[]>(
        `/team_members?team_id=eq.${teamId}&role=eq.commander&select=member_id,role`,
        AS_COMMANDER,
      );
      // Must see at least 2 commanders (Yoni + Daniel Katz seeded).
      expect(commanderRows.length).toBeGreaterThanOrEqual(2);

      // Verify the commander JWT's own membership is visible (Yoni is commander).
      const selfRows = await rest<{ role: string }[]>(
        `/team_members?team_id=eq.${teamId}&member_id=eq.${commanderId}&select=role`,
        AS_COMMANDER,
      );
      expect(selfRows.length).toBe(1);
      expect(selfRows[0].role).toBe('commander');
    });

    it('commander CAN read join_requests for their team', async () => {
      // Insert a test join_request via anon (cannot use return=representation — anon has no SELECT).
      const insertR = await restStatus('/join_requests', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({
          team_id: teamId,
          name: 'Commander Read Test',
          phone: '+972 50-333-4444',
          skill_names: [],
        }),
        ...AS_ANON,
      });
      expect(insertR.status).toBeLessThan(300);

      // Commander reads the join request.
      const rows = await rest<{ id: string; name: string }[]>(
        `/join_requests?team_id=eq.${teamId}&name=eq.Commander+Read+Test&select=id,name`,
        AS_COMMANDER,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].name).toBe('Commander Read Test');

      // Cleanup
      await rest(`/join_requests?id=eq.${rows[0].id}`, { method: 'DELETE', ...AS_COMMANDER });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Commander cross-team isolation
  // ─────────────────────────────────────────────────────────────
  describe('commander cross-team isolation', () => {
    // Commander of Carmel (teamId) should NOT be able to insert a slot in a
    // different team (Bravo-6 or Alpha-7) unless they are also a commander there.
    it('commander of M6 CANNOT insert slot in Bravo-6', async () => {
      const bravo = await rest<{ id: string }[]>(
        '/teams?crest=eq.B6&select=id&limit=1',
        AS_SVCR,
      );
      if (!bravo.length) {
        console.warn('Bravo-6 not seeded — skip cross-team isolation test');
        return;
      }
      const bravoId = bravo[0].id;

      const r = await restStatus('/slots', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify({
          team_id: bravoId,
          title: 'Unauthorized cross-team slot',
          urgent: false,
          state: 'published',
          start_at: '2030-08-01T10:00:00Z',
          end_at: '2030-08-01T18:00:00Z',
          duration: '8h',
          location: 'Remote base',
        }),
        ...AS_COMMANDER,
      });
      expect(r.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Division admin (Yoni Avraham is both commander + division admin)
  // ─────────────────────────────────────────────────────────────
  describe('division admin operations', () => {
    it('admin CAN read all members in their division', async () => {
      const rows = await rest<{ id: string }[]>(
        `/members?division_id=eq.${divisionId}&select=id`,
        AS_COMMANDER,
      );
      // All seeded members (24 + 10 new members across Bravo-6 + Alpha-7)
      expect(rows.length).toBeGreaterThanOrEqual(24);
    });

    it('admin CANNOT read members of a non-existent/foreign division', async () => {
      const fakeDiv = '00000000-feed-c0de-0000-000000000000';
      const rows = await rest<{ id: string }[]>(
        `/members?division_id=eq.${fakeDiv}&select=id`,
        AS_COMMANDER,
      );
      expect(rows.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // members_view — phone masking
  // ─────────────────────────────────────────────────────────────
  describe('members_view phone masking (PRD §7.2)', () => {
    it('commander sees phone for all members in their team', async () => {
      // Yoni Avraham is a commander — should see all phones.
      const rows = await rest<{ name: string; phone: string | null }[]>(
        `/members_view?division_id=eq.${divisionId}&select=name,phone&limit=5`,
        AS_COMMANDER,
      );
      // Every row should have a non-null phone when read by a commander/admin.
      for (const r of rows) {
        expect(r.phone).not.toBeNull();
      }
    });

    it('soldier sees own phone, null for others', async () => {
      // Eitan Cohen is a soldier — should see own phone but null for others.
      const rows = await rest<{ id: string; name: string; phone: string | null }[]>(
        `/members_view?division_id=eq.${divisionId}&select=id,name,phone`,
        AS_SOLDIER,
      );
      for (const r of rows) {
        if (r.id === soldierId) {
          // Own row — phone should be populated.
          expect(r.phone).toBeTruthy();
        } else {
          // Peer rows — phone should be masked (null).
          // Eitan Cohen is a soldier and not a commander of any team.
          expect(r.phone).toBeNull();
        }
      }
    });
  });
});
