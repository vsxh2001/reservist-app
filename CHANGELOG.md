# Changelog

Format roughly follows [Keep a Changelog](https://keepachangelog.com).
Unreleased section accumulates between deploys; once a real cut happens
this header gets renamed to a dated version.

## Unreleased

### Added

- Component extractions, parallel to the dashboard slim-down:
  - `MyStatusCard`, `MyPhoneVisibilityCard`, `MySkillsCard` from
    `ReservistDashboard` (#89)
  - `MyActivityCard` (#97)
  - `NextDeploymentBanner` (#99)
  - `MyProfileSection` (#102)
  - `Card` shared primitive (#89)
  - `CommanderTopbar`, `DashboardOverlays`, `DashboardScreenRouter`
    from the commander dashboard (#115, #116, #117)
  - `SkillFilterBuilder` from `Roster` (#123)
  - `SkillEditor` from `PersonDrawer` (#124)
  - `lib/csv.ts` from `ActivityScreen` (#113)
  - `lib/constants.ts` (`MS_PER_HOUR`, `MS_PER_DAY`) + `lib/members.ts`
    (`getActiveMembers`) (#101)
- Push notification helpers for the slot lifecycle (#88, #92, #94):
  - `notifyPickDecided` on commander approve/reject of a deployment pick
  - `notifySlotChanged` on slot edit (PRD §7.8)
  - `notifySlotCancelled` on slot cancellation (PRD §7.8)
  - `notifySlotUnassigned` on commander removing a member from a slot
  - `notifyBulkCancelled` on `useBulkCancelSlots`: a range bulk-cancel now
    pushes each affected assignee once via a single grouped fan-out, closing
    the §7.8 gap where single-slot cancel notified but bulk cancel was silent
    (#154)
  - `notifyDayAdded` on `useDirectAddPick`: when a commander unilaterally
    records an approved deployment day for a member, that member now gets a
    push — previously only the proposed-pick approve/reject path
    (`notifyPickDecided`) notified, so direct-adds were silent (#155)
  - `notifyStatusChanged` on `useUpdateStatus`: when a commander overrides a
    reservist's availability status (PRD §7.3) the reservist now gets a push
    instead of only discovering the change on next app open; suppressed when
    a commander edits their own status (setBy === memberId) (#156)
- Realtime listeners for `teams` and `projects` so cross-device sessions
  pick up renames, `show_unit_schedule` toggles, and invite rotations (#105)
- Accessibility:
  - `lib/a11y.ts` `activate()` helper for non-button clickable elements (#96)
  - Keyboard handlers + `aria-current` for sidebar nav links and the
    sign-out tile (#96, #98, #114)
  - Roster stat-filter / sortable-header / row keyboard activation (#98)
  - Checkbox `Check` atom keyboard activation (#96)
  - `Roster` bulk-clear button `aria-label` (#98)
- Tests (suite 692 → 837, +145):
  - Unit: `isoDay`, `monthGridCells`, `getActiveMembers`, `activate()`,
    notify helpers (#103, #96, #94, #88)
  - Unit: `urlBase64ToUint8Array` — the VAPID applicationServerKey decoder
    in `push.ts`, the previously-untested hinge of every push subscription;
    covers url-safe substitution, padding restoration, and a 65-byte P-256
    key round-trip (#157)
  - Unit: `PrefsProvider` — the previously-untested dir/lang preference
    store that mirrors both onto `<html>` and persists to `localStorage`.
    Pins the LTR/en default, the dir + lang merge contract on partial
    setters, the rehydrate-from-storage path, the corrupt-JSON fallback,
    and the `usePrefs outside PrefsProvider` guard before the deferred
    RTL/i18n library migration lands (#159)
  - Unit: `TeamProvider` — the previously-untested active-team selector
    that every screen reads from via `useActiveTeam`. Pins the
    loading + empty-membership shapes, the auto-pick-first-team +
    persist-to-`localStorage` flow, the rehydrate-from-storage path, the
    auto-correct when a stored team_id is no longer in the member's
    teams (e.g. the member was removed between sessions), `setTeamId`
    persistence, and the `useActiveTeam outside TeamProvider` guard.
    Same precedent as #159 / #157: pin the small hinge before it gets
    touched by deferred auth / multi-team work
  - Unit: `AuthProvider` — the previously-untested auth hinge every
    screen reads from via `useAuth`. Pins the initial `loading` state,
    the `no-session` / `no-link` / `linked` resolutions of `applySession`,
    the production-safety contract that a stored `reservist.mockUser`
    is ignored when `VITE_MOCK_AUTH !== '1'`, the dev-mode mock-localStorage
    fallback, the `onAuthStateChange` sign-out transition, listener
    unsubscribe on unmount, `signInWithGoogle` redirect-to-origin,
    `signInAsMock` calling `signInWithPassword` with the seeded
    `'unused'` password (seed.sql §P), `signOut` clearing the mock key,
    `refreshLink` no-op-when-no-authUser + `no-link` → `linked` promotion
    + the retry-before-claim race where it must stay `no-link`, the
    PostgREST-error branch of `resolveMember` collapsing to `no-link`,
    and the `useAuth outside AuthProvider` guard. Same precedent as
    #160 / #159 / #157: pin the small hinge before the deferred PRD §7.1
    auth tightening lands
  - Unit: `useRealtime` — the previously-untested hook every dashboard
    mounts to invalidate the React Query cache from Postgres-changes
    events. Pins the no-op when `teamId` is undefined, the
    `team:${teamId}` channel name, the full set of subscribed tables,
    the per-table invalidation map (`members` → members + my-member +
    members-in-division, `team_members` → members + teams-for-member +
    team + teams-for-division, `activity_log` → activity + my-activity,
    `slots` → slots + my-slots + team-day, `join_requests` →
    join-requests, `deployment_windows` → deployment-windows +
    my-deployment-windows, `deployment_picks` → the full pick fan-out
    incl. `team-day` + `approved-picks`, `teams` → team +
    teams-for-division + teams-for-member, `projects` → projects), the
    `removeChannel` on unmount, and the re-subscribe (cleanup + new
    channel + new filter strings) when `teamId` changes. The
    invalidation map is silent in production — a drift just means the
    UI stops auto-refreshing for that table — so the contract has to
    fail loudly here
  - Component: `DashboardOverlays` — the previously-untested
    presentational shell that mounts `PersonDrawer`, `SlotDrawer`, and
    `NewSlotModal` above the commander dashboard. Pins the
    render-when-truthy guards (`person` / `slotDrawer` null → not
    mounted; non-null → mounted with the right prop), the always-mount
    contract of `NewSlotModal` with `open` mirroring `modal.open`, and
    the `cloneFrom={modal.cloneFrom ?? null}` undefined→null coercion
    that keeps a stale optional from leaking into the modal's
    `Slot | null` prop. Forwards-`teamId`-from-`team.id` is pinned for
    both `SlotDrawer` and `NewSlotModal`. Same precedent as #160-#162:
    pin the small hinge before the deferred PRD §9 confirm/decline
    assignment flow lands another overlay through here
  - Component: every extracted card + filter + screen-router gets a
    focused test (#106, #108, #110, #111, #112, #114, #115, #118, #123, #124)
- Deploy infrastructure:
  - `web/.env.production.example` (#91)
  - `supabase/.env.example` (#129)
  - `web/vercel.json` with security headers + SPA fallback (#132)
  - `DEPLOY.md` runbook (#133)
  - `.github/workflows/deploy-vercel.yml` (#91, dormant)
  - `.github/workflows/deploy-supabase.yml` (#93, dormant)
  - `SUPABASE_DB_PASSWORD` wiring + guard (#131)
- Repo hygiene:
  - `.nvmrc` pinning Node 22 (#135)
  - `.editorconfig` for whitespace conventions (#136)
  - `.github/dependabot.yml` for weekly npm + monthly Actions updates (#137)

### Changed

- Build toolchain upgraded to Vite 8 (from 5.4), `@vitejs/plugin-react`
  6 (from 4.3), and `@vitejs/plugin-basic-ssl` 2 (from 1.2). Vite 8
  bundles with Rolldown, so the vendor-split config moved from Rollup's
  object-form `manualChunks` to the equivalent function form. React
  Compiler peers stay opt-out (not enabled). Supersedes the deadlocked
  Dependabot pair #150 + #151 (#164).
- Bundle now splits into 4 chunks (react / supabase / query / app) for
  better caching across deploys (#119).
- Workbox: `cleanupOutdatedCaches: true` so stale buckets don't push
  iOS Safari over its quota (#109).
- PostgREST error toasts route through `humanizeError` in
  `SettingsScreen`, `DivisionAdminScreen`, and `push.ts` (#95, #104).
- `Roster` table actions now use the shared `activate()` keyboard
  helper instead of inline `role="button"` JSX.
- ReservistDashboard 953 → 330 LOC (-65%) across #89, #97, #99, #102.
- Commander `Dashboard.tsx` 305 → 183 LOC (-40%) across #115, #116, #117.

### Fixed

- Build no longer pollutes the working tree. The `build` script ran
  `tsc -b` against a single non-composite project with emit on, dumping
  ~62 untracked `.js`/`.d.ts` files into `web/src` on every build. Switched
  to typecheck-only (`tsc --noEmit && vite build`, plus `noEmit: true` in
  `tsconfig.json` and a new `typecheck` script); vite still does the emit.
  Dropped the vestigial `-b` (no project references exist) so no
  `.tsbuildinfo` is written either. Added defensive `.gitignore` entries
  (`*.tsbuildinfo`, `src/**/*.js`, `src/**/*.d.ts`) (#165).
- Race conditions:
  - `useResolvePick` double-approve race (HIGH): commander concurrent
    approve/reject of the same pick (#120).
  - `useAssignToSlot` clobber + `useUnassignFromSlot` phantom log
    (MEDIUM) (#121).
  - `useUpdateStatus` / `useUpdateSlot` audit-trail gap on partial
    failure (LOW) (#122).
  - Optimistic-concurrency guards on three more state transitions, each
    now `.eq('state', currentState).select('id')` + 0-row check (mirrors
    `useResolvePick`): `useUpdateSlotState` (publish/cancel/complete vs a
    concurrent change), `useWithdrawDayPick` (reservist withdraw vs
    commander decide), and `useUpdateDeploymentWindow` (open↔close); the
    callers now pass the state they last observed. Prevents duplicate
    activity-log entries and push notifications on a lost race (#166).
- send-push Edge Function audit (5/5 findings):
  - Input length caps on title/body/url/tag/recipients (#125)
  - Endpoint stripped from failure logs (#126)
  - Fan-out parallelism capped at 50 sends/batch (#127)
  - CORS allowlist via `CORS_ALLOWED_ORIGINS` env (#128)
  - In-memory per-caller rate limit (`SEND_PUSH_RATE_MAX`, default 30/min) (#130)
- FK indexes for member-reference audit columns added (#100). One
  hallucinated column was caught by CI before merge.
- 4 unused icons removed from `Icon.tsx` (`minus`, `star`, `starOpen`,
  `dollar`) (#107).
- Deployment-calendar timezone drift in `calendarUtils.ts`: `monthsBetween`
  and `monthGridCells` parsed date-only `start_date` / `end_date` via
  `new Date(str)` (UTC midnight) instead of local time. In a non-UTC
  timezone this shifted the bounds across local midnight — a window starting
  `2026-06-01` rendered a stray month, and the window's first/last day were
  mis-flagged in the grid highlight (visible to the app's UTC+2/+3 users:
  the first day of every window went un-highlighted). Both now parse in
  local time, matching `windowCountdown` / `untilHint`. Adds `monthsBetween`
  unit tests + a `monthGridCells` boundary-day test, both TZ-robust (#153).

### Security

- Activity-log CSV export now neutralizes spreadsheet formula injection:
  user-controlled `actor_name` / `what` cells starting with `= + - @` or
  whitespace are prefixed with `'` so a name like `=HYPERLINK(...)` can't
  execute on open in Excel / Sheets / LibreOffice (OWASP "CSV Injection").
  `csv.ts` gains a 23-case unit test (#152).
- `send-push` Edge Function now rejects a `url` that is not root-relative
  (`/...`). The notification-click target is fed to `clients.openWindow()` in
  the push service worker, so an absolute `https://attacker.example/...`
  would have rendered as a trusted notification ("Slot updated…") that
  navigates the reservist off-domain on click. Protocol-relative
  `//attacker.example/...` is also rejected (the case a naive
  `startsWith("/")` would have admitted). No `notify.ts` helper currently
  sets `url`, so this guard is inert for current callers — defense-in-depth
  only, in the same lane as the recent 5-finding `send-push` audit.
