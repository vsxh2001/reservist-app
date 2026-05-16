# Deployment Windows — Design Spec

**Status:** Draft
**Date:** 2026-05-16
**Scope:** Reservist-side feature with commander-side approval surface.
**Related PRD sections:** §6 user stories (reservist), §7.3 status management, §7.6 reservist schedule, §7.8 notifications.

## 1. Problem

A reservist's miluim period is typically a contiguous date range (e.g. May 10–31). Within that range, the reservist physically arrives only on some days (work obligations, family, alternating with squadmates). Today, that day-by-day arrival plan is negotiated by phone or in WhatsApp; the commander has no durable record of who is present on which day, and the reservist has no app surface to declare their planned days.

## 2. Goal

Give the commander a place to document each reservist's deployment window, and let the reservist mark the specific days they'll arrive within that window. Each marked day flows through commander approval. Both sides see the live state.

## 3. Non-goals (v1)

- Auto-link picks to existing duty slots. Deployment windows and slots stay independent.
- Headcount targets, skill requirements, or coverage chart at the day level.
- Cross-reservist day-view aggregation for the commander (planned for next iteration; the data model supports it).
- Push notifications when picks change state.
- Conflict detection between picks and slot assignments.
- Reservist-initiated window creation.

## 4. Concept

A **deployment window** is a per-reservist time window the commander creates (label + start/end + notes). Within the window, the reservist marks individual days; each marked day is a **pick** that flows through approval (`proposed → approved | rejected`). The commander can also add a day directly in `approved` state to record a verbal agreement.

The term is chosen to avoid collision with the existing `slot.state='draft'` value.

## 5. Data model

Two new tables. Both unit-scoped (denormalized `unit_id` for future RLS), both in the `supabase_realtime` publication.

```sql
create type window_state_enum as enum ('open', 'closed');
create type pick_state_enum  as enum ('proposed', 'approved', 'rejected', 'withdrawn');

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
create index deployment_picks_date_idx on deployment_picks(date) where state = 'approved';
```

A view `deployment_windows_view` exposes per-window counts:

```sql
create view deployment_windows_view as
select
  w.*,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'proposed')  as proposed_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'approved')  as approved_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'rejected')  as rejected_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'withdrawn') as withdrawn_count
from deployment_windows w;
```

Permissive anon RLS policies for MVP (mirroring existing tables). Both tables go into `supabase_realtime`.

## 6. Lifecycle

### Window
- `open` (default): picks editable on both sides.
- `closed`: archive; no edits, view-only. Commander toggles.

### Pick
States: `proposed`, `approved`, `rejected`, `withdrawn`. Transitions:

| From         | Action                          | To          | Side       |
|--------------|---------------------------------|-------------|------------|
| (no row)     | reservist marks day             | proposed    | reservist  |
| (no row)     | commander direct-add (verbal)   | approved    | commander  |
| proposed     | reservist withdraws             | withdrawn   | reservist  |
| proposed     | commander approves              | approved    | commander  |
| proposed     | commander rejects               | rejected    | commander  |
| approved     | reservist withdraws             | withdrawn   | reservist  |
| rejected     | reservist re-proposes           | proposed    | reservist  |
| withdrawn    | reservist re-marks              | proposed    | reservist  |

All transitions are `UPDATE`s on the existing row keyed by `(window_id, date)` — no row is ever hard-deleted on user action. Re-propose clears `resolved_at` / `resolved_by` / `commander_note` (full negotiation history would need an event log; out of scope for v1). Withdrawn-after-approved is visually flagged for the commander.

### Window edit
If commander shrinks the date range, existing picks outside the new range are preserved but marked stale in the UI. Commander resolves manually.

## 7. Permissions

- **Commander only**:
  - Create / edit / close window
  - Approve, reject, direct-add picks
  - Edit `commander_note`
- **Reservist only**:
  - Mark, withdraw, re-propose own picks within their own window
  - Edit `reservist_note` on their own picks
- **All**: read

(MVP enforces this client-side; real RLS scoping ships with the Google-auth migration.)

## 8. UI surfaces

### Commander — PersonDrawer

A new section "Deployment windows" lists the member's windows (label + range + a `proposed/approved` mini-bar). A `+ New window` form takes label, start, end, notes.

Tapping a window opens a `DeploymentWindowDrawer` (right-side, similar to `PersonDrawer`):

- Top: label + range + state badge + edit affordance + close-window button
- Middle: a vertically stacked sequence of one month grid per calendar month the window touches (a window straddling two months shows two grids). Days outside the window are rendered greyed-out and non-interactive. Each in-window day is a `DayCell` colored by pick state (proposed = accent-soft, approved = accent filled, rejected = urgent-soft, withdrawn = ghosted, empty = card).
- Tap a `proposed` cell → quick approve / reject buttons + optional `commander_note` input.
- Tap empty cell → "Add as approved" (records verbal agreement directly).
- Live: a small urgent dot appears on the window's row in `PersonDrawer` when `proposed_count > 0`.

### Reservist — `ReservistDashboard`

A "My next deployment" card appears when the member has any `open` window covering today or a future date. Card content: label, range, summary (`5 approved · 2 proposed · 3 days left to mark`).

Tap → `DeploymentPickScreen`:

- Header: label + range + state legend.
- Month grid. Tap behavior by cell state:
  - empty → mark (upserts a `proposed` row keyed by `(window_id, date)`).
  - own `proposed` → withdraw (sets state `withdrawn`).
  - `approved` → confirm-then-withdraw (sets state `withdrawn`).
  - `rejected` → re-propose (sets state `proposed`, clears commander fields).
  - `withdrawn` → re-mark (sets state `proposed`).
- Long-press / "..." → optional `reservist_note`.
- Footer: "Done" returns to dashboard.

Past windows reachable via `All windows` link → list view, read-only when `closed`.

### Shared atom

`DayCell` — small square button rendering `date.getDate()` + a status pip + dashed/solid border by state. Reused by commander and reservist views. Touch target ≥ 40px (existing pointer-coarse media query already handles).

## 9. Queries + mutations

Add to `web/src/lib/queries.ts`:

```
useMemberDeploymentWindows(memberId)        // commander side, PersonDrawer
useMyDeploymentWindows(userId)              // reservist side, dashboard card
useDeploymentPicks(windowId)                // both sides, drawer/screen body
useCreateDeploymentWindow                   // commander
useUpdateDeploymentWindow                   // commander (label/dates/notes/state)
useProposeDayPick                           // reservist
useWithdrawDayPick                          // reservist
useResolvePick                              // commander (approve | reject + note)
useDirectAddPick                            // commander (verbal-agreement path)
```

Each commander mutation also writes an entry to `activity_log` with `tone='accent'`.

## 10. Realtime

Both new tables enter the `supabase_realtime` publication. The existing `useRealtime(unitId)` channel adds two `postgres_changes` subscriptions:

```
deployment_windows  filter unit_id=eq.<unitId>   → invalidate ['deployment-windows', '*']
deployment_picks    no filter                    → invalidate ['deployment-picks', '*']
```

Pick rows don't carry `unit_id`. We invalidate broadly on any pick change; the query keys are scoped per window so re-fetches are local.

## 11. Testing

Vitest additions:

- Unit: a `picksCoverage(picks)` helper that returns `{proposed, approved, rejected, withdrawn}` counts — keep logic out of components.
- Integration: REST roundtrips for window CRUD + pick state transitions, including unique constraint on `(window_id, date)` and that closing a window does not delete picks.
- Component test deferred (consistent with the rest of the suite).

## 12. Rollout

One migration applies schema + view + realtime publication. Seed adds one open window for `Avi Mizrahi` with mixed-state picks so the screens look populated immediately.

Mock-login MVP keeps working; permissions enforced client-side only. Real RLS lands with Google auth.

## 13. Risks

- **Naming collision.** `slot.state='draft'` and "deployment window" share the colloquial word "draft" in conversation. Chose "deployment window" in the codebase + UI to keep them distinct.
- **Pick withdrawal after approval** can surprise a commander mid-planning. The commander side flags this case but does not block it. If this becomes painful, restrict withdrawal-of-approved to require commander acknowledgment.
- **Window edit shrinkage** can leave orphan picks. We preserve them with a UI flag rather than auto-delete to keep the audit trail.
- **No conflict detection** across the reservist's existing slot assignments in the same date. If they have an `approved` pick on a day they're already assigned to a slot, neither surface warns. Acceptable for v1; revisit when the commander day-view lands.
