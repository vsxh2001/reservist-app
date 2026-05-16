# Deployment Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-reservist deployment windows where commander documents a date range and reservist marks day picks (`proposed → approved | rejected`), with commander approval and live realtime sync.

**Architecture:** Two new tables (`deployment_windows`, `deployment_picks`) plus a view, in the existing `supabase_realtime` publication. Pure TS helpers in `lib/types.ts` for state derivation. Query layer in `lib/queries.ts` exposes one `use*Windows` / `use*Picks` per side and CRUD mutations. Reservist side gets a new `DeploymentPickScreen` mounted from a card in `ReservistDashboard`. Commander side gets a section in `PersonDrawer` opening a `DeploymentWindowDrawer`. Shared `DayCell` atom renders per-state.

**Tech Stack:** Vite + React 18 + TypeScript, Supabase (Postgres + PostgREST + Realtime), TanStack Query v5, Vitest + happy-dom.

**Spec reference:** `docs/superpowers/specs/2026-05-16-deployment-windows-design.md`

---

## File structure

**Create**
- `supabase/migrations/<ts>_deployment_windows.sql` — schema + view + RLS + realtime publication entries
- `web/src/components/DayCell.tsx` — shared per-day square button atom
- `web/src/components/DeploymentPickScreen.tsx` — reservist month-grid screen
- `web/src/components/DeploymentWindowDrawer.tsx` — commander right-side drawer with approve/reject + direct-add + window edit
- `web/test/integration/deployment.test.ts` — REST roundtrips for window + pick lifecycle

**Modify**
- `supabase/seed.sql` — append one open window + mixed picks for Avi Mizrahi
- `web/src/lib/types.ts` — enums, interfaces, `picksCoverage` helper
- `web/src/lib/queries.ts` — six new hooks
- `web/src/lib/realtime.ts` — two new channel subscriptions
- `web/src/ReservistDashboard.tsx` — "My next deployment" card + screen state
- `web/src/components/PersonDrawer.tsx` — "Deployment windows" section + new-window inline form
- `web/src/Dashboard.tsx` — plumb commander drawer state
- `web/test/types.test.ts` — `picksCoverage` unit cases

---

## Task 1: DB schema + view + publication + policies

**Files:**
- Create: `supabase/migrations/20260516120000_deployment_windows.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260516120000_deployment_windows.sql
create type window_state_enum as enum ('open', 'closed');
create type pick_state_enum   as enum ('proposed', 'approved', 'rejected', 'withdrawn');

create table deployment_windows (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  unit_id     uuid not null references units(id)   on delete cascade,
  label       text not null,
  start_date  date not null,
  end_date    date not null,
  notes       text,
  state       window_state_enum not null default 'open',
  created_by  uuid references members(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index deployment_windows_member_idx on deployment_windows(member_id, start_date);
create index deployment_windows_unit_idx   on deployment_windows(unit_id, state);

create table deployment_picks (
  id             uuid primary key default gen_random_uuid(),
  window_id      uuid not null references deployment_windows(id) on delete cascade,
  date           date not null,
  state          pick_state_enum not null default 'proposed',
  reservist_note text,
  commander_note text,
  proposed_at    timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references members(id) on delete set null,
  unique (window_id, date)
);
create index deployment_picks_window_state_idx on deployment_picks(window_id, state);
create index deployment_picks_date_approved_idx on deployment_picks(date) where state = 'approved';

create or replace view deployment_windows_view as
select
  w.*,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'proposed')  as proposed_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'approved')  as approved_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'rejected')  as rejected_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'withdrawn') as withdrawn_count
from deployment_windows w;

alter table deployment_windows enable row level security;
alter table deployment_picks   enable row level security;

create policy "anon read deployment_windows"   on deployment_windows for select using (true);
create policy "anon insert deployment_windows" on deployment_windows for insert with check (true);
create policy "anon update deployment_windows" on deployment_windows for update using (true) with check (true);
create policy "anon delete deployment_windows" on deployment_windows for delete using (true);

create policy "anon read deployment_picks"    on deployment_picks for select using (true);
create policy "anon insert deployment_picks"  on deployment_picks for insert with check (true);
create policy "anon update deployment_picks"  on deployment_picks for update using (true) with check (true);
create policy "anon delete deployment_picks"  on deployment_picks for delete using (true);

alter publication supabase_realtime add table deployment_windows;
alter publication supabase_realtime add table deployment_picks;
```

- [ ] **Step 2: Apply + verify**

Run: `~/.local/bin/supabase db reset --workdir /home/hadassi/Code/reservist_app`
Expected: migration applied, no errors.

Verify:
```bash
KEY=$(grep VITE_SUPABASE_ANON_KEY /home/hadassi/Code/reservist_app/web/.env | cut -d= -f2)
curl -s "http://127.0.0.1:54321/rest/v1/deployment_windows_view?select=id,label,state,proposed_count,approved_count,rejected_count,withdrawn_count" -H "apikey: $KEY"
```
Expected: `[]` (empty array, schema present, view valid).

- [ ] **Step 3: Commit**

```bash
cd /home/hadassi/Code/reservist_app
git add supabase/migrations/20260516120000_deployment_windows.sql
git commit -m "feat(db): deployment_windows + deployment_picks schema"
```

---

## Task 2: Seed sample window + picks for Avi Mizrahi

**Files:**
- Modify: `supabase/seed.sql` (append at end, before any final newline)

- [ ] **Step 1: Append seed lines**

Open `supabase/seed.sql` and append after the existing seed block:

```sql
-- Sample deployment window for demo
with avi as (select id, unit_id from members where name = 'Avi Mizrahi'),
     creator as (select id from members where name = 'Yoni Avraham'),
     w as (
       insert into deployment_windows (member_id, unit_id, label, start_date, end_date, notes, state, created_by)
       select avi.id, avi.unit_id, 'Spring stretch', date '2026-05-10', date '2026-05-31',
              'Talked Sunday — 21-day stretch. Avi will alternate with Uri.',
              'open', (select id from creator)
       from avi
       returning id
     )
insert into deployment_picks (window_id, date, state, reservist_note, commander_note, resolved_at, resolved_by)
select w.id, d, st, rnote, cnote,
       case when st in ('approved','rejected') then now() else null end,
       case when st in ('approved','rejected') then (select id from members where name = 'Yoni Avraham') else null end
from w, (values
  (date '2026-05-10', 'approved'::pick_state_enum,  null,                 'good, you anchor day 1'),
  (date '2026-05-11', 'approved'::pick_state_enum,  null,                 null),
  (date '2026-05-12', 'approved'::pick_state_enum,  null,                 null),
  (date '2026-05-17', 'proposed'::pick_state_enum,  'family obligation am', null),
  (date '2026-05-18', 'proposed'::pick_state_enum,  null,                 null),
  (date '2026-05-24', 'rejected'::pick_state_enum,  null,                 'need you off — overlap with Uri'),
  (date '2026-05-25', 'proposed'::pick_state_enum,  null,                 null)
) as p(d, st, rnote, cnote);
```

- [ ] **Step 2: Apply + verify**

Run: `~/.local/bin/supabase db reset --workdir /home/hadassi/Code/reservist_app`
Expected: clean apply.

Verify:
```bash
KEY=$(grep VITE_SUPABASE_ANON_KEY /home/hadassi/Code/reservist_app/web/.env | cut -d= -f2)
curl -s "http://127.0.0.1:54321/rest/v1/deployment_windows_view?select=label,start_date,end_date,proposed_count,approved_count,rejected_count" -H "apikey: $KEY"
```
Expected: one row with `proposed_count=3, approved_count=3, rejected_count=1`.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "chore(seed): sample deployment window for Avi Mizrahi"
```

---

## Task 3: Types — enums, interfaces, `picksCoverage` helper

**Files:**
- Modify: `web/src/lib/types.ts` (append exports)
- Test: `web/test/types.test.ts` (append cases)

- [ ] **Step 1: Write failing test for `picksCoverage`**

Append to `web/test/types.test.ts`:

```ts
import {
  picksCoverage,
  type DeploymentPick,
} from '../src/lib/types';

describe('picksCoverage', () => {
  const make = (state: DeploymentPick['state']): DeploymentPick => ({
    id: state, window_id: 'w', date: '2026-05-10', state,
    reservist_note: null, commander_note: null,
    proposed_at: '2026-05-09T00:00:00Z',
    resolved_at: null, resolved_by: null,
  });

  it('counts all states', () => {
    const c = picksCoverage([
      make('proposed'), make('proposed'),
      make('approved'),
      make('rejected'),
      make('withdrawn'),
    ]);
    expect(c).toEqual({ proposed: 2, approved: 1, rejected: 1, withdrawn: 1, total: 5 });
  });

  it('returns zero counts for empty input', () => {
    expect(picksCoverage([])).toEqual({ proposed: 0, approved: 0, rejected: 0, withdrawn: 0, total: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/hadassi/Code/reservist_app/web && npx vitest run test/types.test.ts`
Expected: FAIL on import — `picksCoverage` and `DeploymentPick` not exported.

- [ ] **Step 3: Add types + helper**

Append to `web/src/lib/types.ts`:

```ts
export type WindowState = 'open' | 'closed';
export type PickState   = 'proposed' | 'approved' | 'rejected' | 'withdrawn';

export interface DeploymentWindow {
  id: string;
  member_id: string;
  unit_id: string;
  label: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  state: WindowState;
  created_by: string | null;
  created_at: string;
  proposed_count: number;
  approved_count: number;
  rejected_count: number;
  withdrawn_count: number;
}

export interface DeploymentPick {
  id: string;
  window_id: string;
  date: string;
  state: PickState;
  reservist_note: string | null;
  commander_note: string | null;
  proposed_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface PicksCoverage {
  proposed: number;
  approved: number;
  rejected: number;
  withdrawn: number;
  total: number;
}

export function picksCoverage(picks: DeploymentPick[]): PicksCoverage {
  const c: PicksCoverage = { proposed: 0, approved: 0, rejected: 0, withdrawn: 0, total: picks.length };
  for (const p of picks) c[p.state] += 1;
  return c;
}
```

- [ ] **Step 4: Run tests**

Run: `cd /home/hadassi/Code/reservist_app/web && npx vitest run test/types.test.ts`
Expected: all green (25 prior + 2 new = 27 tests pass).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/types.ts web/test/types.test.ts
git commit -m "feat(types): deployment window/pick types + picksCoverage"
```

---

## Task 4: Query hooks (fetches) + realtime subscriptions

**Files:**
- Modify: `web/src/lib/queries.ts` (append exports)
- Modify: `web/src/lib/realtime.ts` (add channels)

- [ ] **Step 1: Add fetch hooks to `queries.ts`**

Open `web/src/lib/queries.ts`. Add to the top-level imports (merge into the existing `from './types'` line):
```ts
import type {
  ActivityItem, DeploymentPick, DeploymentWindow, JoinRequest,
  Member, MemberSkill, Slot, SlotSkill, SkillLevel, Status, Unit,
} from './types';
```

Append at the bottom of the file:

```ts
export function useMemberDeploymentWindows(memberId: string | undefined) {
  return useQuery({
    queryKey: ['deployment-windows', memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<DeploymentWindow[]> => {
      const { data, error } = await supabase
        .from('deployment_windows_view')
        .select('*')
        .eq('member_id', memberId!)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data as DeploymentWindow[];
    },
  });
}

export function useMyDeploymentWindows(userId: string | undefined) {
  // Same query as commander side; kept under a separate key so reservist + commander
  // can subscribe independently without sharing a cache slot.
  return useQuery({
    queryKey: ['my-deployment-windows', userId],
    enabled: !!userId,
    queryFn: async (): Promise<DeploymentWindow[]> => {
      const { data, error } = await supabase
        .from('deployment_windows_view')
        .select('*')
        .eq('member_id', userId!)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data as DeploymentWindow[];
    },
  });
}

export function useDeploymentPicks(windowId: string | undefined) {
  return useQuery({
    queryKey: ['deployment-picks', windowId],
    enabled: !!windowId,
    queryFn: async (): Promise<DeploymentPick[]> => {
      const { data, error } = await supabase
        .from('deployment_picks')
        .select('*')
        .eq('window_id', windowId!)
        .order('date');
      if (error) throw error;
      return data as DeploymentPick[];
    },
  });
}
```

- [ ] **Step 2: Add realtime subscriptions**

Replace the existing channel chain in `web/src/lib/realtime.ts` so two new lines are appended before `.subscribe()`. The file should read:

```ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export function useRealtime(unitId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!unitId) return;
    const ch = supabase
      .channel(`unit:${unitId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `unit_id=eq.${unitId}` },
        () => qc.invalidateQueries({ queryKey: ['members'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log', filter: `unit_id=eq.${unitId}` },
        () => qc.invalidateQueries({ queryKey: ['activity'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots', filter: `unit_id=eq.${unitId}` },
        () => qc.invalidateQueries({ queryKey: ['slots'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slot_assignees' },
        () => qc.invalidateQueries({ queryKey: ['slots'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deployment_windows', filter: `unit_id=eq.${unitId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['deployment-windows'] });
          qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deployment_picks' },
        () => {
          qc.invalidateQueries({ queryKey: ['deployment-picks'] });
          qc.invalidateQueries({ queryKey: ['deployment-windows'] });
          qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [unitId, qc]);
}
```

The `deployment_picks` row has no `unit_id`; we broaden the filter and let TanStack invalidate by query key prefix.

- [ ] **Step 3: TS check**

Run: `cd /home/hadassi/Code/reservist_app/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/queries.ts web/src/lib/realtime.ts
git commit -m "feat(queries): deployment window/pick fetch hooks + realtime"
```

---

## Task 5: Mutation hooks

**Files:**
- Modify: `web/src/lib/queries.ts` (append)

- [ ] **Step 1: Append mutation hooks**

Append at the bottom of `web/src/lib/queries.ts`:

```ts
export function useCreateDeploymentWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; unitId: string;
      label: string; startDate: string; endDate: string; notes: string | null;
      createdBy: string; actorName: string; memberName: string;
    }) => {
      const { data, error } = await supabase
        .from('deployment_windows')
        .insert({
          member_id: vars.memberId, unit_id: vars.unitId,
          label: vars.label, start_date: vars.startDate, end_date: vars.endDate,
          notes: vars.notes, created_by: vars.createdBy,
        })
        .select('id')
        .single();
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId, actor_id: vars.createdBy, actor_name: vars.actorName,
        verb: 'opened deployment window',
        what: `${vars.memberName} · ${vars.label} (${vars.startDate} → ${vars.endDate})`,
        tone: 'accent',
      });
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useUpdateDeploymentWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      windowId: string; unitId: string; actorId: string; actorName: string;
      patch: { label?: string; startDate?: string; endDate?: string; notes?: string | null; state?: 'open' | 'closed' };
    }) => {
      const row: Record<string, unknown> = {};
      if (vars.patch.label     !== undefined) row.label      = vars.patch.label;
      if (vars.patch.startDate !== undefined) row.start_date = vars.patch.startDate;
      if (vars.patch.endDate   !== undefined) row.end_date   = vars.patch.endDate;
      if (vars.patch.notes     !== undefined) row.notes      = vars.patch.notes;
      if (vars.patch.state     !== undefined) row.state      = vars.patch.state;
      if (Object.keys(row).length === 0) return;
      const { error } = await supabase.from('deployment_windows').update(row).eq('id', vars.windowId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId, actor_id: vars.actorId, actor_name: vars.actorName,
        verb: vars.patch.state === 'closed' ? 'closed deployment window' : 'edited deployment window',
        what: null, tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useProposeDayPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      windowId: string; date: string; reservistNote: string | null;
    }) => {
      // Upsert keyed by (window_id, date): re-propose resets commander fields.
      const { error } = await supabase
        .from('deployment_picks')
        .upsert({
          window_id: vars.windowId, date: vars.date,
          state: 'proposed', reservist_note: vars.reservistNote,
          commander_note: null, resolved_at: null, resolved_by: null,
          proposed_at: new Date().toISOString(),
        }, { onConflict: 'window_id,date' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
    },
  });
}

export function useWithdrawDayPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { pickId: string }) => {
      const { error } = await supabase
        .from('deployment_picks')
        .update({ state: 'withdrawn', resolved_at: new Date().toISOString() })
        .eq('id', vars.pickId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
    },
  });
}

export function useResolvePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      pickId: string; nextState: 'approved' | 'rejected';
      commanderNote: string | null;
      actorId: string; actorName: string; unitId: string; memberName: string; date: string;
    }) => {
      const { error } = await supabase
        .from('deployment_picks')
        .update({
          state: vars.nextState, commander_note: vars.commanderNote,
          resolved_at: new Date().toISOString(), resolved_by: vars.actorId,
        })
        .eq('id', vars.pickId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId, actor_id: vars.actorId, actor_name: vars.actorName,
        verb: vars.nextState === 'approved' ? 'approved deployment day' : 'rejected deployment day',
        what: `${vars.memberName} · ${vars.date}`,
        tone: vars.nextState === 'approved' ? 'accent' : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useDirectAddPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      windowId: string; date: string;
      actorId: string; actorName: string; unitId: string; memberName: string;
    }) => {
      const { error } = await supabase
        .from('deployment_picks')
        .upsert({
          window_id: vars.windowId, date: vars.date,
          state: 'approved', proposed_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(), resolved_by: vars.actorId,
        }, { onConflict: 'window_id,date' });
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId, actor_id: vars.actorId, actor_name: vars.actorName,
        verb: 'recorded deployment day',
        what: `${vars.memberName} · ${vars.date}`,
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
```

- [ ] **Step 2: TS check**

Run: `cd /home/hadassi/Code/reservist_app/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/queries.ts
git commit -m "feat(queries): deployment window/pick mutations + activity log"
```

---

## Task 6: `DayCell` atom

**Files:**
- Create: `web/src/components/DayCell.tsx`

- [ ] **Step 1: Write file**

```tsx
// web/src/components/DayCell.tsx
import type { PickState } from '../lib/types';

interface Props {
  date: Date;
  /** Pick state if any, otherwise undefined renders as 'empty'. */
  state?: PickState;
  inWindow: boolean;
  isToday?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}

const stateStyle: Record<PickState, { bg: string; fg: string; border: string }> = {
  proposed:  { bg: 'var(--accent-tint)', fg: 'var(--accent-deep)', border: 'var(--accent)' },
  approved:  { bg: 'var(--accent)',      fg: 'var(--card)',        border: 'var(--accent-deep)' },
  rejected:  { bg: 'var(--urgent-bg)',   fg: 'var(--urgent-deep)', border: 'var(--urgent)' },
  withdrawn: { bg: 'transparent',        fg: 'var(--ink-mute)',    border: 'var(--line)' },
};

export function DayCell({ date, state, inWindow, isToday, disabled, onClick, title }: Props) {
  const s = state ? stateStyle[state] : null;
  const interactive = !disabled && inWindow && !!onClick;
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      title={title}
      style={{
        appearance: 'none',
        height: 44, minWidth: 44,
        padding: 0,
        borderRadius: 8,
        border: '1px ' + (state === 'withdrawn' ? 'dashed ' : 'solid ') + (s ? s.border : 'var(--line-soft)'),
        background: s ? s.bg : 'var(--card)',
        color: s ? s.fg : 'var(--ink)',
        opacity: inWindow ? (disabled ? 0.6 : 1) : 0.25,
        cursor: interactive ? 'pointer' : 'default',
        fontFamily: isToday ? 'var(--serif)' : 'var(--sans)',
        fontSize: isToday ? 18 : 13,
        fontWeight: 500,
        display: 'grid', placeItems: 'center',
        position: 'relative',
      }}
    >
      {date.getDate()}
      {isToday && (
        <span style={{
          position: 'absolute', insetInlineStart: '50%', bottom: 4,
          transform: 'translateX(-50%)',
          width: 4, height: 4, borderRadius: 99,
          background: s ? s.fg : 'var(--accent)',
        }} />
      )}
    </button>
  );
}
```

- [ ] **Step 2: TS check**

Run: `cd /home/hadassi/Code/reservist_app/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/DayCell.tsx
git commit -m "feat(ui): DayCell atom for deployment grids"
```

---

## Task 7: Reservist `DeploymentPickScreen`

**Files:**
- Create: `web/src/components/DeploymentPickScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
// web/src/components/DeploymentPickScreen.tsx
import { useMemo, useState } from 'react';
import { Button } from './atoms';
import { Icon } from './Icon';
import { DayCell } from './DayCell';
import { useDeploymentPicks, useProposeDayPick, useWithdrawDayPick } from '../lib/queries';
import type { DeploymentPick, DeploymentWindow } from '../lib/types';

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthsBetween(startISO: string, endISO: string): Date[] {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const months: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function monthGridCells(monthFirst: Date, startISO: string, endISO: string) {
  const year = monthFirst.getFullYear();
  const month = monthFirst.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7; // week starts Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; inMonth: boolean; inWindow: boolean }[] = [];
  const winStart = new Date(startISO);
  const winEnd = new Date(endISO);
  for (let i = 0; i < offset; i++) {
    const d = new Date(year, month, 1 - (offset - i));
    cells.push({ date: d, inMonth: false, inWindow: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const inWin = d >= winStart && d <= winEnd;
    cells.push({ date: d, inMonth: true, inWindow: inWin });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false, inWindow: false });
  }
  return cells;
}

interface Props {
  window: DeploymentWindow;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function DeploymentPickScreen({ window: w, onClose, onToast }: Props) {
  const picks = useDeploymentPicks(w.id);
  const propose = useProposeDayPick();
  const withdraw = useWithdrawDayPick();
  const [busyDay, setBusyDay] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, DeploymentPick>();
    for (const p of picks.data ?? []) m.set(p.date, p);
    return m;
  }, [picks.data]);

  const months = monthsBetween(w.start_date, w.end_date);
  const today = isoDay(new Date());

  const tap = async (dateISO: string) => {
    if (w.state === 'closed') return;
    if (busyDay) return;
    setBusyDay(dateISO);
    try {
      const existing = byDate.get(dateISO);
      if (!existing || existing.state === 'rejected' || existing.state === 'withdrawn') {
        await propose.mutateAsync({ windowId: w.id, date: dateISO, reservistNote: null });
        onToast(`Marked ${dateISO}`);
      } else if (existing.state === 'proposed' || existing.state === 'approved') {
        await withdraw.mutateAsync({ pickId: existing.id });
        onToast(`Withdrew ${dateISO}`);
      }
    } finally {
      setBusyDay(null);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%',
      background: 'var(--paper)', color: 'var(--ink)',
    }}>
      <header className="topbar" style={{ borderBottom: '1px solid var(--line)' }}>
        <Button variant="ghost" size="icon" onClick={onClose} data-tip="Back">
          <Icon name="chevRight" size={15} style={{ transform: 'rotate(180deg)' }} />
        </Button>
        <h1 className="topbar-title">{w.label} <em>{w.start_date} → {w.end_date}</em></h1>
      </header>

      <div className="scroll" style={{ padding: '16px 14px 60px' }}>
        <div style={{
          padding: 14, marginBottom: 18,
          background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12,
          display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12.5,
        }}>
          <Legend color="var(--accent)"      label={`${w.approved_count} approved`}  />
          <Legend color="var(--accent-tint)" label={`${w.proposed_count} proposed`}  />
          <Legend color="var(--urgent-bg)"   label={`${w.rejected_count} rejected`}  />
          {w.state === 'closed' && (
            <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Closed
            </span>
          )}
        </div>

        {months.map((m) => (
          <section key={`${m.getFullYear()}-${m.getMonth()}`} style={{ marginBottom: 22 }}>
            <h2 style={{
              margin: '0 0 10px',
              fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400, letterSpacing: '-.01em',
            }}>
              {m.toLocaleString('en-US', { month: 'long' })} <em style={{ color: 'var(--ink-soft)' }}>{m.getFullYear()}</em>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
                <div key={d} style={{
                  fontFamily: 'var(--mono)', fontSize: 10.5,
                  textTransform: 'uppercase', letterSpacing: '.08em',
                  color: 'var(--ink-mute)', textAlign: 'center', padding: '4px 0',
                }}>{d}</div>
              ))}
              {monthGridCells(m, w.start_date, w.end_date).map((c, i) => {
                const iso = isoDay(c.date);
                const pick = byDate.get(iso);
                return (
                  <DayCell
                    key={i}
                    date={c.date}
                    state={pick?.state}
                    inWindow={c.inMonth && c.inWindow}
                    isToday={iso === today}
                    disabled={busyDay !== null && busyDay !== iso}
                    onClick={() => tap(iso)}
                    title={pick?.commander_note ?? pick?.reservist_note ?? undefined}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, background: color, border: '1px solid var(--line)' }} />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: TS check**

Run: `cd /home/hadassi/Code/reservist_app/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/DeploymentPickScreen.tsx
git commit -m "feat(reservist): DeploymentPickScreen month-grid"
```

---

## Task 8: ReservistDashboard "My next deployment" card

**Files:**
- Modify: `web/src/ReservistDashboard.tsx`

- [ ] **Step 1: Add imports**

At the top of `web/src/ReservistDashboard.tsx`, replace the existing imports block with:

```ts
import { useMemo, useState } from 'react';
import { Avatar, Button, SkillChip, StatusPill } from './components/atoms';
import { Icon } from './components/Icon';
import { DeploymentPickScreen } from './components/DeploymentPickScreen';
import { useAuth } from './lib/auth';
import {
  useMyDeploymentWindows, useMyMember, useMySlots, useSelfUpdateStatus, useUnit,
} from './lib/queries';
import { useRealtime } from './lib/realtime';
import { STATUS_LABEL, type DeploymentWindow, type Status } from './lib/types';
```

- [ ] **Step 2: Fetch windows + add active state**

Inside `ReservistDashboard`, after the existing `const slots = useMySlots(user?.id);` line, insert:

```ts
  const windows = useMyDeploymentWindows(user?.id);
  const [activeWindow, setActiveWindow] = useState<DeploymentWindow | null>(null);

  const nextWindow = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (windows.data ?? [])
      .filter((w) => w.state === 'open' && new Date(w.end_date) >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
  }, [windows.data]);
```

- [ ] **Step 3: Render the screen when one is active**

At the top of the returned JSX (right after `if (!me.data) return ...`) — before the existing `<div>` wrapper — insert:

```tsx
  if (activeWindow) {
    return (
      <DeploymentPickScreen
        window={activeWindow}
        onClose={() => setActiveWindow(null)}
        onToast={showToast}
      />
    );
  }
```

- [ ] **Step 4: Render the "My next deployment" card**

Inside the existing `<div className="scroll">` body, immediately before the `{/* Status card */}` comment, insert:

```tsx
        {nextWindow && (
          <section style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: 16, marginBottom: 14,
            background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: 12,
            cursor: 'pointer',
          }} onClick={() => setActiveWindow(nextWindow)}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: 'var(--accent)', color: 'var(--card)',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <Icon name="calendar" size={20}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase',
                letterSpacing: '.08em', color: 'var(--ink-mute)',
              }}>My next deployment</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 400, marginTop: 2 }}>
                {nextWindow.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                {nextWindow.start_date} → {nextWindow.end_date} · {nextWindow.approved_count} approved · {nextWindow.proposed_count} proposed
              </div>
            </div>
            <Icon name="chevRight" size={16} />
          </section>
        )}
```

- [ ] **Step 5: TS check**

Run: `cd /home/hadassi/Code/reservist_app/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/ReservistDashboard.tsx
git commit -m "feat(reservist): My next deployment card + pick screen entry"
```

---

## Task 9: `DeploymentWindowDrawer` (commander)

**Files:**
- Create: `web/src/components/DeploymentWindowDrawer.tsx`

- [ ] **Step 1: Write the file**

```tsx
// web/src/components/DeploymentWindowDrawer.tsx
import { useMemo, useState } from 'react';
import { Button, IconButton } from './atoms';
import { Icon } from './Icon';
import { DayCell } from './DayCell';
import {
  useDeploymentPicks, useDirectAddPick, useResolvePick,
  useUpdateDeploymentWindow, useWithdrawDayPick,
} from '../lib/queries';
import { useAuth } from '../lib/auth';
import type { DeploymentPick, DeploymentWindow } from '../lib/types';

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthsBetween(startISO: string, endISO: string): Date[] {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const months: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}
function monthGridCells(monthFirst: Date, startISO: string, endISO: string) {
  const year = monthFirst.getFullYear();
  const month = monthFirst.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; inMonth: boolean; inWindow: boolean }[] = [];
  const winStart = new Date(startISO);
  const winEnd = new Date(endISO);
  for (let i = 0; i < offset; i++) {
    const d = new Date(year, month, 1 - (offset - i));
    cells.push({ date: d, inMonth: false, inWindow: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const inWin = d >= winStart && d <= winEnd;
    cells.push({ date: d, inMonth: true, inWindow: inWin });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false, inWindow: false });
  }
  return cells;
}

interface Props {
  window: DeploymentWindow;
  memberName: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function DeploymentWindowDrawer({ window: w, memberName, onClose, onToast }: Props) {
  const { user } = useAuth();
  const picks = useDeploymentPicks(w.id);
  const resolve = useResolvePick();
  const direct = useDirectAddPick();
  const withdraw = useWithdrawDayPick();
  const updateWindow = useUpdateDeploymentWindow();

  const [selected, setSelected] = useState<DeploymentPick | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [editingMeta, setEditingMeta] = useState(false);
  const [label, setLabel] = useState(w.label);
  const [startDate, setStartDate] = useState(w.start_date);
  const [endDate, setEndDate] = useState(w.end_date);
  const [notes, setNotes] = useState(w.notes ?? '');

  const byDate = useMemo(() => {
    const m = new Map<string, DeploymentPick>();
    for (const p of picks.data ?? []) m.set(p.date, p);
    return m;
  }, [picks.data]);

  const cellTap = (dateISO: string) => {
    const pick = byDate.get(dateISO);
    if (!pick) {
      setSelected(null);
      setSelectedDate(dateISO);
    } else {
      setSelected(pick);
      setSelectedDate(dateISO);
      setNoteDraft(pick.commander_note ?? '');
    }
  };

  const approve = async () => {
    if (!user || !selected) return;
    await resolve.mutateAsync({
      pickId: selected.id, nextState: 'approved',
      commanderNote: noteDraft.trim() ? noteDraft.trim() : null,
      actorId: user.id, actorName: user.name,
      unitId: w.unit_id, memberName, date: selected.date,
    });
    onToast(`Approved ${selected.date}`);
    setSelected(null); setSelectedDate(null); setNoteDraft('');
  };
  const reject = async () => {
    if (!user || !selected) return;
    await resolve.mutateAsync({
      pickId: selected.id, nextState: 'rejected',
      commanderNote: noteDraft.trim() ? noteDraft.trim() : null,
      actorId: user.id, actorName: user.name,
      unitId: w.unit_id, memberName, date: selected.date,
    });
    onToast(`Rejected ${selected.date}`);
    setSelected(null); setSelectedDate(null); setNoteDraft('');
  };
  const directAdd = async () => {
    if (!user || !selectedDate) return;
    await direct.mutateAsync({
      windowId: w.id, date: selectedDate,
      actorId: user.id, actorName: user.name,
      unitId: w.unit_id, memberName,
    });
    onToast(`Added ${selectedDate}`);
    setSelectedDate(null);
  };
  const withdrawApproved = async () => {
    if (!selected) return;
    await withdraw.mutateAsync({ pickId: selected.id });
    onToast(`Withdrew ${selected.date}`);
    setSelected(null); setSelectedDate(null);
  };
  const saveMeta = async () => {
    if (!user) return;
    await updateWindow.mutateAsync({
      windowId: w.id, unitId: w.unit_id,
      actorId: user.id, actorName: user.name,
      patch: { label, startDate, endDate, notes: notes.trim() ? notes : null },
    });
    setEditingMeta(false);
    onToast('Window updated');
  };
  const closeWindow = async () => {
    if (!user) return;
    await updateWindow.mutateAsync({
      windowId: w.id, unitId: w.unit_id,
      actorId: user.id, actorName: user.name,
      patch: { state: 'closed' },
    });
    onToast('Window closed');
    onClose();
  };

  const months = monthsBetween(w.start_date, w.end_date);
  const today = isoDay(new Date());

  return (
    <>
      <div className="drawer-overlay" data-open="1" onClick={onClose} />
      <div className="drawer" data-open="1" role="dialog" aria-label={w.label}>
        <div className="drawer-head" style={{ background: 'var(--card-soft)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!editingMeta ? (
              <>
                <h3 className="name">{w.label}</h3>
                <div className="role-line" style={{ flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {w.start_date} → {w.end_date}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 10,
                    padding: '1px 6px', borderRadius: 4,
                    textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600,
                    background: w.state === 'open' ? 'var(--accent-tint)' : 'var(--card-soft)',
                    color: w.state === 'open' ? 'var(--accent-deep)' : 'var(--ink-soft)',
                  }}>{w.state}</span>
                  <span className="edit" onClick={() => setEditingMeta(true)}>Edit</span>
                </div>
                {w.notes && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-soft)' }}>{w.notes}</div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
                <div className="form-grid">
                  <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingMeta(false); setLabel(w.label); setStartDate(w.start_date); setEndDate(w.end_date); setNotes(w.notes ?? ''); }}>Cancel</Button>
                  <Button size="sm" variant="primary" icon="check" disabled={updateWindow.isPending} onClick={saveMeta}>Save</Button>
                </div>
              </div>
            )}
          </div>
          <button className="action-btn" onClick={onClose} aria-label="Close" style={{ alignSelf: 'flex-start' }}>
            <Icon name="x" size={14}/>
          </button>
        </div>

        <div className="drawer-body">
          {months.map((m) => (
            <section key={`${m.getFullYear()}-${m.getMonth()}`} style={{ marginBottom: 18 }}>
              <h4 style={{
                margin: '0 0 8px',
                fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-mute)',
              }}>
                {m.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {['M','T','W','T','F','S','S'].map((d, i) => (
                  <div key={i} style={{
                    fontFamily: 'var(--mono)', fontSize: 10,
                    color: 'var(--ink-mute)', textAlign: 'center',
                  }}>{d}</div>
                ))}
                {monthGridCells(m, w.start_date, w.end_date).map((c, i) => {
                  const iso = isoDay(c.date);
                  const pick = byDate.get(iso);
                  return (
                    <DayCell
                      key={i}
                      date={c.date}
                      state={pick?.state}
                      inWindow={c.inMonth && c.inWindow}
                      isToday={iso === today}
                      disabled={w.state === 'closed'}
                      onClick={() => cellTap(iso)}
                      title={pick?.commander_note ?? pick?.reservist_note ?? undefined}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          {selectedDate && (
            <div className="drawer-section">
              <h4>{selected ? `${selected.state.toUpperCase()} · ${selectedDate}` : `Empty · ${selectedDate}`}</h4>
              {selected?.reservist_note && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBlockEnd: 8, fontStyle: 'italic' }}>
                  "{selected.reservist_note}"
                </div>
              )}
              {!selected && (
                <Button size="sm" variant="primary" icon="check"
                        disabled={direct.isPending || w.state === 'closed'}
                        onClick={directAdd}>
                  Add as approved
                </Button>
              )}
              {selected?.state === 'proposed' && (
                <>
                  <input className="input" placeholder="Commander note (optional)"
                         value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                         style={{ marginBlockEnd: 8 }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button size="sm" variant="primary" icon="check"
                            disabled={resolve.isPending} onClick={approve}>Approve</Button>
                    <Button size="sm" variant="ghost" icon="x"
                            disabled={resolve.isPending} onClick={reject}
                            style={{ color: 'var(--urgent-deep)' }}>Reject</Button>
                  </div>
                </>
              )}
              {selected?.state === 'approved' && (
                <Button size="sm" variant="ghost" icon="x"
                        disabled={withdraw.isPending} onClick={withdrawApproved}
                        style={{ color: 'var(--urgent-deep)' }}>
                  Withdraw
                </Button>
              )}
              {selected?.state === 'rejected' && selected.commander_note && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  Rejected with note: "{selected.commander_note}"
                </div>
              )}
            </div>
          )}

          {w.state === 'open' && (
            <div className="drawer-section">
              <h4>Window actions</h4>
              <Button size="sm" variant="ghost" icon="x" onClick={closeWindow}
                      disabled={updateWindow.isPending}
                      style={{ color: 'var(--urgent-deep)' }}>
                Close window (archive)
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: TS check**

Run: `cd /home/hadassi/Code/reservist_app/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/DeploymentWindowDrawer.tsx
git commit -m "feat(commander): DeploymentWindowDrawer with approve/reject + edit + close"
```

---

## Task 10: PersonDrawer "Deployment windows" section + new-window form

**Files:**
- Modify: `web/src/components/PersonDrawer.tsx`

- [ ] **Step 1: Add imports + state**

In `web/src/components/PersonDrawer.tsx`, replace the existing top imports block with:

```ts
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Avatar, Button, IconButton, SkillChip, StatusPill } from './atoms';
import { DeploymentWindowDrawer } from './DeploymentWindowDrawer';
import {
  SKILL_LEVELS, SKILL_LEVEL_LABEL, STATUS_LABEL,
  type DeploymentWindow, type Member, type SkillLevel, type Status,
} from '../lib/types';
import {
  useCreateDeploymentWindow, useDeleteMember, useMemberDeploymentWindows,
  usePromoteMember, useRemoveMemberSkill, useSetMemberSkill, useUpdateStatus,
} from '../lib/queries';
import { useAuth } from '../lib/auth';
```

After the existing `const removeSkill = useRemoveMemberSkill();` line, add:

```ts
  const createWindow = useCreateDeploymentWindow();
  const windows = useMemberDeploymentWindows(person.id);
  const [openingWindow, setOpeningWindow] = useState<DeploymentWindow | null>(null);
  const [newWinOpen, setNewWinOpen] = useState(false);
  const [nwLabel, setNwLabel] = useState('');
  const [nwStart, setNwStart] = useState('');
  const [nwEnd, setNwEnd] = useState('');
  const [nwNotes, setNwNotes] = useState('');
```

- [ ] **Step 2: Add submit handler**

After the existing `const togglePromote = async () => { ... };` block, add:

```ts
  const submitNewWindow = async () => {
    if (!user) return;
    await createWindow.mutateAsync({
      memberId: person.id, unitId: person.unit_id,
      label: nwLabel.trim(), startDate: nwStart, endDate: nwEnd,
      notes: nwNotes.trim() ? nwNotes.trim() : null,
      createdBy: user.id, actorName: user.name, memberName: person.name,
    });
    setNewWinOpen(false);
    setNwLabel(''); setNwStart(''); setNwEnd(''); setNwNotes('');
    onToast('Deployment window opened');
  };
```

- [ ] **Step 3: Render the section + drawer**

Find the `<div className="drawer-section">` for `<h4>Permissions</h4>` and insert this section IMMEDIATELY BEFORE it:

```tsx
              <div className="drawer-section">
                <h4>Deployment windows
                  <span className="edit" onClick={() => setNewWinOpen((v) => !v)}>
                    {newWinOpen ? 'Cancel' : '+ New window'}
                  </span>
                </h4>
                {newWinOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBlockEnd: 10 }}>
                    <input className="input" placeholder="Label (e.g. Spring stretch)" value={nwLabel} onChange={(e) => setNwLabel(e.target.value)} />
                    <div className="form-grid">
                      <input className="input" type="date" value={nwStart} onChange={(e) => setNwStart(e.target.value)} />
                      <input className="input" type="date" value={nwEnd} onChange={(e) => setNwEnd(e.target.value)} />
                    </div>
                    <input className="input" placeholder="Notes (optional)" value={nwNotes} onChange={(e) => setNwNotes(e.target.value)} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <Button size="sm" variant="primary" icon="check"
                              disabled={!nwLabel.trim() || !nwStart || !nwEnd || createWindow.isPending}
                              onClick={submitNewWindow}>
                        Open window
                      </Button>
                    </div>
                  </div>
                )}
                {(windows.data ?? []).length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                    No deployment windows yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(windows.data ?? []).map((w) => {
                      const total = w.proposed_count + w.approved_count + w.rejected_count;
                      return (
                        <button key={w.id}
                                onClick={() => setOpeningWindow(w)}
                                style={{
                                  appearance: 'none', font: 'inherit', textAlign: 'start',
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '8px 10px', borderRadius: 8,
                                  background: 'var(--paper-deep)',
                                  border: '1px solid var(--line-soft)',
                                  cursor: 'pointer',
                                  position: 'relative',
                                }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>
                              {w.label}
                              {w.state === 'closed' && (
                                <span style={{
                                  marginInlineStart: 6, fontFamily: 'var(--mono)', fontSize: 9.5,
                                  background: 'var(--card-soft)', color: 'var(--ink-soft)',
                                  padding: '1px 5px', borderRadius: 3,
                                  textTransform: 'uppercase', letterSpacing: '.06em',
                                }}>CLOSED</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                              {w.start_date} → {w.end_date} · {w.approved_count}✓ {w.proposed_count}◌ {w.rejected_count}✕
                            </div>
                          </div>
                          {w.proposed_count > 0 && w.state === 'open' && (
                            <span style={{
                              width: 8, height: 8, borderRadius: 99,
                              background: 'var(--urgent)',
                              boxShadow: '0 0 0 3px color-mix(in srgb, var(--urgent) 20%, transparent)',
                            }}/>
                          )}
                          <Icon name="chevRight" size={12} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
```

At the very end of the component's returned JSX — right before the closing `</>` — add:

```tsx
        {openingWindow && (
          <DeploymentWindowDrawer
            window={openingWindow}
            memberName={person.name}
            onClose={() => setOpeningWindow(null)}
            onToast={onToast}
          />
        )}
```

- [ ] **Step 4: TS check**

Run: `cd /home/hadassi/Code/reservist_app/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PersonDrawer.tsx
git commit -m "feat(commander): Deployment windows section in PersonDrawer"
```

---

## Task 11: Integration tests — window + pick lifecycle

**Files:**
- Create: `web/test/integration/deployment.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// web/test/integration/deployment.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMemberIdByName, getUnitId, rest, supabaseReachable } from './_supabase';

describe('Deployment windows + picks', () => {
  let unitId: string;
  let memberId: string;
  let actorId: string;
  let windowId: string;

  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
    unitId = await getUnitId();
    memberId = await getMemberIdByName('Eitan Cohen');
    actorId = await getMemberIdByName('Yoni Avraham');
    const created = await rest<{ id: string }[]>('/deployment_windows', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        member_id: memberId, unit_id: unitId,
        label: 'Integration test window',
        start_date: '2030-01-01', end_date: '2030-01-15',
        notes: 'vitest', created_by: actorId,
      }),
    });
    windowId = created[0].id;
  });

  afterAll(async () => {
    await rest(`/deployment_windows?id=eq.${windowId}`, { method: 'DELETE' });
    // Clean up any activity_log rows we generated
    await rest(`/activity_log?unit_id=eq.${unitId}&actor_id=eq.${actorId}&verb=in.(approved%20deployment%20day,rejected%20deployment%20day,recorded%20deployment%20day,opened%20deployment%20window,edited%20deployment%20window,closed%20deployment%20window)`, { method: 'DELETE' });
  });

  it('view returns zero counts initially', async () => {
    const rows = await rest<{ proposed_count: number; approved_count: number; rejected_count: number; withdrawn_count: number }[]>(
      `/deployment_windows_view?id=eq.${windowId}&select=proposed_count,approved_count,rejected_count,withdrawn_count`,
    );
    expect(rows[0]).toEqual({ proposed_count: 0, approved_count: 0, rejected_count: 0, withdrawn_count: 0 });
  });

  it('proposes a pick and view increments proposed_count', async () => {
    await rest('/deployment_picks', {
      method: 'POST',
      body: JSON.stringify({ window_id: windowId, date: '2030-01-05', state: 'proposed' }),
    });
    const rows = await rest<{ proposed_count: number }[]>(`/deployment_windows_view?id=eq.${windowId}&select=proposed_count`);
    expect(rows[0].proposed_count).toBe(1);
  });

  it('rejects unique constraint on (window_id, date)', async () => {
    let threw = false;
    try {
      await rest('/deployment_picks', {
        method: 'POST',
        body: JSON.stringify({ window_id: windowId, date: '2030-01-05', state: 'proposed' }),
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('approves the pick and counts shift', async () => {
    await rest(`/deployment_picks?window_id=eq.${windowId}&date=eq.2030-01-05`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'approved', resolved_at: new Date().toISOString(), resolved_by: actorId }),
    });
    const rows = await rest<{ proposed_count: number; approved_count: number }[]>(
      `/deployment_windows_view?id=eq.${windowId}&select=proposed_count,approved_count`,
    );
    expect(rows[0]).toEqual({ proposed_count: 0, approved_count: 1 });
  });

  it('closing a window preserves picks', async () => {
    await rest(`/deployment_windows?id=eq.${windowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
    const picks = await rest<{ state: string }[]>(
      `/deployment_picks?window_id=eq.${windowId}&select=state`,
    );
    expect(picks.length).toBeGreaterThan(0);
  });

  it('CHECK constraint rejects end_date before start_date', async () => {
    let threw = false;
    try {
      await rest('/deployment_windows', {
        method: 'POST',
        body: JSON.stringify({
          member_id: memberId, unit_id: unitId, label: 'bad',
          start_date: '2030-02-01', end_date: '2030-01-01', created_by: actorId,
        }),
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
```

- [ ] **Step 2: Run integration suite**

Run: `cd /home/hadassi/Code/reservist_app/web && npx vitest run test/integration/deployment.test.ts`
Expected: 6/6 pass.

- [ ] **Step 3: Run full test suite**

Run: `cd /home/hadassi/Code/reservist_app/web && npm test`
Expected: all suites pass (prior 34 + new 2 unit + new 6 integration = 42 tests).

- [ ] **Step 4: Commit**

```bash
git add web/test/integration/deployment.test.ts
git commit -m "test(integration): deployment_windows + picks lifecycle"
```

---

## Task 12: Final verification + push

- [ ] **Step 1: TypeScript check**

Run: `cd /home/hadassi/Code/reservist_app/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Full test suite**

Run: `cd /home/hadassi/Code/reservist_app/web && npm test`
Expected: green.

- [ ] **Step 3: Browser smoke**

Vite dev should be running (`npm run dev`). Open `https://localhost:5174/`:

1. Pick **Avi Mizrahi** (non-commander) from the login picker.
2. Expect a "My next deployment" card showing `Spring stretch · 3 approved · 2 proposed`.
3. Tap the card → month grid for May 2026.
4. Tap an empty in-window day → cell flips to proposed, card count updates.
5. Tap that proposed day again → cell flips to empty/withdrawn, card count updates.

Switch identity:

1. Sign out, pick **Yoni Avraham**.
2. Open the roster, click **Avi Mizrahi** → PersonDrawer.
3. Expect a "Deployment windows" section listing `Spring stretch · 2026-05-10 → 2026-05-31 · 3✓ 2◌ 1✕` with an urgent dot.
4. Click the row → DeploymentWindowDrawer opens with the month grid.
5. Tap a proposed (light-accent) day → action panel appears → Approve → cell flips to filled-accent.
6. Tap an empty in-window day → "Add as approved" button works.
7. Switch back to Avi (open new tab over HTTPS) and confirm realtime: a commander approval should refresh Avi's screen without manual reload.

- [ ] **Step 4: Push to remote**

```bash
cd /home/hadassi/Code/reservist_app
git push origin main
```

Expected: branch updated on `github.com/vsxh2001/reservist-app`.
