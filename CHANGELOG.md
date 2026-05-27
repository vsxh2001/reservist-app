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
- Tests (suite 692 → 823, +131):
  - Unit: `isoDay`, `monthGridCells`, `getActiveMembers`, `activate()`,
    notify helpers (#103, #96, #94, #88)
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

- Race conditions:
  - `useResolvePick` double-approve race (HIGH): commander concurrent
    approve/reject of the same pick (#120).
  - `useAssignToSlot` clobber + `useUnassignFromSlot` phantom log
    (MEDIUM) (#121).
  - `useUpdateStatus` / `useUpdateSlot` audit-trail gap on partial
    failure (LOW) (#122).
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
