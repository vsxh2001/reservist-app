# Product Requirements Document: Reservist App (working title)

**Status:** Draft v1.1
**Last updated:** 2026-05-16
**Owner:** [Your name]
**Document type:** PRD — for engineering and design alignment

**Changelog**
- v1.1 (2026-05-16): Dropped the military role/specialty field from the product surface. Skill tags now carry a level (junior / intermediate / senior) and slots specify a minimum level per required skill. Filtering and slot-candidate matching use skill+level. See §7.2, §7.4, §7.5.

---

## 1. Summary

An unofficial, grassroots mobile + web app that helps IDF reservists (miluim) and their commanders coordinate duty and deployment. The product solves two tightly-linked problems: commanders need to quickly find reservists they can call up, and reservists need visibility into their upcoming duty obligations. The app focuses on small-unit scale (squad/platoon, 10–30 people) and is built by and for reservists themselves — not an official IDF tool.

## 2. Problem statement

Today, reservist coordination at the squad/platoon (tzevet/mahlaka) level happens in WhatsApp groups, ad-hoc phone trees, and personal spreadsheets. This creates real pain:

- **For commanders:** When a slot needs to be filled — especially on short notice — they don't have a single place to see who is available, who has the right specialty, or who to call first. They re-ask the group, re-read old messages, and rely on memory.
- **For reservists:** They learn about their schedule late, through scattered messages. They can't see who else is assigned, what's coming up for them, or easily signal when they're unavailable (abroad, exam period, etc.) until a commander pings them directly.
- **Both sides:** No persistent record of skills, contact info, or availability lives anywhere structured. Every new commander or new operation starts from scratch.

## 3. Goals and non-goals

### Goals
- Give commanders a single, current view of who is in their unit, their availability status, and how to reach them.
- Give reservists clear visibility into their assigned and upcoming duty slots.
- Make scheduling for both planned duty and emergency call-ups faster than the current WhatsApp + spreadsheet flow.
- Be usable by a brand-new commander with no setup help, within 10 minutes of downloading.

### Non-goals (v1)
- Not an official IDF tool; no integration with Aka1 or other military systems.
- Not a replacement for in-app messaging; commanders contact reservists via existing tools (phone, WhatsApp) using contact info surfaced by the app.
- Not tracking total miluim days, 8/3-rule eligibility, or other compliance metrics — these were considered and explicitly cut from scope.
- Not handling actual call-up orders (Tzav 8) — the app surfaces availability and assignments only; legal call-up remains an out-of-band process.

## 4. Target users and personas

### Primary persona: the squad/platoon commander
Manages 10–30 reservists. Often a reservist himself. Needs to fill duty slots, find people with specific specialties (medic, driver, signals, sharpshooter, etc.), and reach available people fast.

### Primary persona: the reservist
Wants to know what's expected of them, when, and to be able to indicate their status (available, on standby, released, unavailable) without a one-on-one conversation.

### Secondary persona: co-commander / deputy
Helps run the unit; needs the same write access as the primary commander.

## 5. Key product decisions (already settled)

| Decision | Choice |
|---|---|
| Context | IDF miluim, grassroots/unofficial |
| Unit scope | Tzevet/Mahlaka (10–30 people) |
| Platforms | Mobile app for reservists, web dashboard for commanders |
| Data entry | Both: reservists self-update, commanders can also edit |
| Onboarding | Commander generates invite link/code; reservists join |
| Commander roles | Multiple commanders/admins with equal rights |
| Reservist statuses | Available / Standby / Released / Unavailable |
| Communication | App surfaces phone numbers; commander contacts via external tools (no in-app messaging) |
| Scheduling model | Commander creates duty slots and assigns reservists |
| Notification on assignment | Informational only; reservist does not need to accept/decline |
| Filtering | By skill + minimum level (junior / intermediate / senior). Role/specialty filter removed in v1.1 |
| Reviews | Commanders can leave reviews on reservists, visible only to commanders |
| Language | English first; Hebrew (RTL) in a later phase |

## 6. User stories

### Commander
- As a commander, I can create a unit and invite my reservists with a shareable link or code.
- As a commander, I can see a roster of everyone in my unit with their current availability status, skills (with level), and phone number.
- As a commander, I can filter the roster by status, by text search, and by one or more skill+minimum-level requirements (e.g. "Combat Medic Cert. ≥ senior").
- As a commander, I can create a duty slot (with date, time, location, required skills + minimum level per skill, number of people needed) and assign reservists to it.
- As a commander, I can create an emergency/urgent call-up slot that is visually distinct from planned duty.
- As a commander, I can edit a reservist's status on their behalf (e.g., when they tell me by phone but haven't updated the app).
- As a commander, I can leave a private review on a reservist that other commanders in the unit can see but the reservist cannot.
- As a co-commander, I have the same permissions as the original commander.

### Reservist
- As a reservist, I can join my unit using an invite link or code from my commander.
- As a reservist, I can set and update my availability status (Available / Standby / Released / Unavailable), optionally with date ranges and a note.
- As a reservist, I can fill out my profile: skills (with self-declared starting level, commander can override), contact phone number.
- As a reservist, I can see all duty slots I've been assigned to, with date, time, and location.
- As a reservist, I get a push notification when I'm assigned to a new duty slot.
- As a reservist, I can see a calendar/list of all upcoming duty for my unit (or just my own — configurable).

## 7. Functional requirements

### 7.1 Unit and identity
- A user creates an account using phone number + SMS OTP (recommended; matches local norms and supports lightweight verification).
- A user can either *create a unit* (becoming a commander) or *join a unit* via invite link/code.
- A unit has: name, optional description, list of members, list of commanders.
- Any commander can promote another member to commander, or generate a new invite link.
- Invite links should be revocable and have an expiration option (default 7 days).

### 7.2 Reservist profile
Each reservist profile contains:
- Display name
- Phone number (shown to commanders; visibility to other reservists is configurable, defaulting to hidden)
- Skills (multi-select tags from a commander-defined per-unit tag set; **each skill carries a level: junior / intermediate / senior**). Default level on self-add is `intermediate`; commanders can override.
- Current availability status (Available / Standby / Released / Unavailable)
- Optional status note (free text, e.g., "abroad until July 3")
- Optional status date range

**Removed in v1.1:** Role/specialty field. The concept of a single role per reservist (Squad Leader, Sniper, Medic, etc.) was found to overlap with skill tags and add little signal during call-up decisions. It has been dropped from the product surface. The underlying DB column is retained for one release as a deprecation cushion but is not exposed in any UI and not used in any business logic.

### 7.3 Status management
- Reservists update their own status from the mobile app.
- Commanders can edit any reservist's status from the web dashboard, with an audit note ("set by [commander name] on [date]").
- Status changes appear in a unit activity feed visible to commanders.

### 7.4 Roster view (commander)
- Sortable, filterable table of all unit members.
- Filters:
  - **Status** (Available / Standby / Released / Unavailable).
  - **Text search** by name, skill name, or phone digits.
  - **Skill requirements** — composable rows of `(skill, ≥ level)`. A reservist matches when they hold *every* listed skill at or above the listed level. Levels: junior, intermediate, senior.
- Each row shows tap-to-call and tap-to-WhatsApp shortcuts that use the device's default dialer / WhatsApp app.
- One-click "copy phone numbers" for all filtered results (useful for pasting into WhatsApp group creation).

### 7.5 Duty slot scheduling
- Commander creates a slot with: title, date, start time, end time (or "ongoing"), location, required skills with **minimum level per skill** (junior / intermediate / senior; default intermediate), number of people needed, notes, urgency flag (planned vs urgent/call-up).
- Candidate picker filters reservists by status (Available + Standby) and by `memberMatchesAllSkillReqs`. Candidates are ranked by (1) status — available before standby, (2) count of requirements met at senior level, (3) name.
- Commander assigns one or more reservists to the slot from the roster.
- Each assignment generates a push notification to the assigned reservist.
- A slot has states: draft, published, completed, cancelled.
- The slot view shows: filled/needed count, names of assignees, status of each assignee.

### 7.6 Reservist schedule view
- "My upcoming duty" list and calendar view.
- "Unit schedule" view showing all slots in the unit (configurable per-unit setting on whether reservists see others' assignments).
- Tap a slot to see full details.

### 7.7 Reviews (commander-only)
- Any commander can leave a review on a reservist in their unit.
- Review contains: rating (1–5 or thumbs up/down — TBD), free-text note, timestamp, author.
- Reviews are visible only to commanders of that unit. The reviewed reservist cannot see them.
- A reservist can request deletion of reviews about them (see Privacy & ethics).

### 7.8 Notifications
- Push notification on: assignment to a duty slot, slot change/cancellation affecting the reservist, urgent call-up posted in the unit (configurable opt-in).
- Email or SMS fallback if push is disabled (v1.x, not v1).

## 8. Non-functional requirements

### 8.1 Privacy and security
This is the most important non-functional area given the sensitivity of the data.

- All data encrypted in transit (TLS) and at rest.
- Phone numbers and unit affiliations should never be exposed to users outside the unit.
- Account deletion must fully delete personal data, including reviews written *about* the user. Reviews written *by* the user are anonymized rather than deleted, to preserve other reservists' history (TBD — see Open questions).
- Comply with Israeli Privacy Protection Law (Chok Hagant HaPratiut). Engage privacy counsel before launch.
- Servers should ideally be hosted in Israel or in an EU region. Hosting in the US is a risk given the user base.

### 8.2 Reliability
- The "find an available reservist" use case is often time-critical (urgent call-up). Roster + status queries must be fast (<500ms p95) and work on flaky mobile connections (cache last known roster locally).

### 8.3 Accessibility & localization
- v1 ships in English. Hebrew (RTL) is the next major milestone — the codebase must be built RTL-aware from day one, even though Hebrew strings aren't shipping in v1.
- Meet WCAG AA basics: contrast, screen-reader labels, focus states.

### 8.4 Platforms
- Mobile: iOS and Android. React Native or Flutter recommended to keep team size lean.
- Web: modern evergreen browsers (Chrome, Safari, Firefox, Edge).

## 9. Out of scope for v1, candidates for v1.x / v2

- In-app messaging (1-on-1 and broadcast)
- Reservist confirm/decline workflow on assignment
- Reservist-initiated swap requests between each other
- Total miluim days tracking and exemption rules (8/3, parent of young children, students, etc.)
- Import from spreadsheets / WhatsApp scrapes
- Multi-unit hierarchy (pluga, gdud)
- Calendar export (iCal, Google Calendar)
- Anonymous tip line or feedback channel for reservists about commanders (the inverse of reviews)
- Hebrew, Arabic, Russian localization

## 10. Risks and open questions

### Risks

1. **Reviews feature is ethically fraught.** Private reviews about people, written by their superiors, with no visibility to the subject — this resembles a covert HR/dossier system. Even if useful for commanders, it could:
   - Become a tool for personal grudges with no recourse.
   - Create legal exposure under defamation or privacy law.
   - Damage trust in the app if reservists find out (and they likely will).
   **Recommendation:** Ship v1 *without* reviews, or with a constrained version (structured tags only, no free text), and revisit visibility (e.g., reservist sees their own reviews anonymized). At minimum, get legal review before launching reviews as designed.

2. **Unofficial military-adjacent tool with sensitive PII is a target.** Phone numbers + unit names + activity data is exactly the kind of dataset adversaries care about. Security investment must be disproportionate to the team size.

3. **Imposter risk in invite-link onboarding.** A leaked invite link could let someone join a unit and exfiltrate the roster. Mitigation: commander must approve new joiners before they see roster, even when joining by link. Worth adding to the spec before build.

4. **Conflict with IDF rules on operational data.** Even though this is unofficial, sharing unit composition, schedules, and locations on a third-party server could violate IDF information-security regulations. Users should be warned in onboarding to not enter classified information (locations, operational details).

5. **Adoption depends on the commander.** If the commander doesn't push the app, reservists won't use it, and the data goes stale fast. The product needs to be valuable enough for the commander on day one that they evangelize it.

### Open questions

- How do we verify a user is actually a reservist and not, say, a journalist or foreign intelligence operative spinning up a fake unit? (For v1: maybe we don't — accept the risk and rely on social proof from real units. Revisit in v1.x.)
- Should the unit setting "reservists see others' assignments" default to on or off?
- For reviews: rating scale or thumbs? Free text or structured tags only?
- What happens to a unit when its only commander leaves the app? Auto-promote longest-tenured reservist, or freeze the unit?
- Pricing/business model: free? Donations? Paid for commanders? Not yet defined.
- Should the app handle Tzav 8 simulations / drills, or stay clear of anything that looks like a real call-up?

## 11. Success metrics

For v1, three months post-launch:

- **Adoption:** at least 50 active units (commander + ≥5 reservists onboarded).
- **Stickiness:** ≥60% of active reservists update their status at least once a month.
- **Core action:** ≥70% of duty slots created result in all required positions being filled within the app (vs commander reverting to WhatsApp).
- **Qualitative:** in-app NPS from commanders ≥ 40.

## 12. Rollout plan

1. **Closed alpha (1 unit):** Build with one specific commander and their unit. Iterate weekly.
2. **Private beta (5–10 units):** Invite-only, recruited from personal networks. Focus on onboarding friction, status hygiene, and assignment flow.
3. **Public beta:** Open registration, but still labeled beta. Add basic analytics and feedback loop.
4. **v1 launch:** Public, all features in scope shipped.
5. **v1.x:** Hebrew RTL, confirm/decline workflow, swap requests.

---

## Appendix A: Decisions deliberately deferred

- **No in-app messaging in v1.** Reservists already live in WhatsApp; rebuilding that experience inside the app is a tar pit. The app's job is to surface *who to call* and *what's scheduled*. The actual conversation happens where it already happens.
- **No accept/decline on assignments in v1.** A simpler informational model ships faster and matches how small units already operate ("you're on this duty — let me know if you can't"). Confirmation flow is a fast-follow if user feedback demands it.
- **No miluim-days tracking.** Considered, then cut. Useful but not core to the "who can I call" + "when am I serving" problem.

## Appendix B: Glossary

- **Miluim** — reserve duty in the IDF.
- **Tzevet** — squad (~10 soldiers).
- **Mahlaka** — platoon (~30 soldiers).
- **Pluga** — company (~80–150 soldiers).
- **Gdud** — battalion (~500–800 soldiers).
- **Tzav 8** — emergency call-up order.
- **Aka1** — IDF's HR/personnel system (mentioned only to note non-integration).
