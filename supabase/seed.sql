-- Seed: Division → Project → Team → Members (Mahlaka 6 — Carmel)
-- Translated from reference/data.js, restructured for the divisions/projects/teams schema.

-- ── 1. Division
with div as (
  insert into divisions (name)
  values ('Mahlaka 6')
  returning id
),

-- ── 2. Project
proj as (
  insert into projects (division_id, name)
  select id, 'Carmel' from div
  returning id, division_id
),

-- ── 3. Team
team as (
  insert into teams (project_id, division_id, name, short_name, crest, invite_code, established)
  select proj.id, proj.division_id,
         'Mahlaka 6 — Carmel', 'Mahlaka 6', 'M6', 'carmel-6-J3xK', 'Established 2021'
  from proj
  returning id, division_id
),

-- ── 4. Skills (scoped to division)
skills_ins as (
  insert into skills (division_id, name)
  select team.division_id, name from team, (values
    ('First Aid Cert.'),
    ('Combat Medic Cert.'),
    ('HMMWV'),
    ('Heavy Truck'),
    ('Night Ops'),
    ('Urban Combat'),
    ('Arabic'),
    ('English (Fluent)'),
    ('Russian'),
    ('Drone Op.'),
    ('Sniper Cert.'),
    ('Mechanic'),
    ('Comms Tech'),
    ('Krav Maga Inst.'),
    ('Cyber'),
    ('GIS / Maps')
  ) as s(name)
  returning id, division_id, name
),

-- ── 5. Members (pooled at division, no unit_id / is_commander / role_id)
members_ins as (
  insert into members (division_id, name, initials, tone, phone, status, status_note, status_until, joined, last_seen, calls_this_year)
  select
    team.division_id,
    m.name, m.initials, m.tone, m.phone,
    m.status::status_enum, m.note, m.until,
    m.joined, m.last_seen, m.calls
  from team, (values
    ('Yoni Avraham',   'YA', 0, '+972 54-221-8843', 'available',   'Returning from south, ETA 18:00',             null::date,     '2021-03', 'active now', 4),
    ('Tamar Levi',     'TL', 1, '+972 50-887-4421', 'standby',     'On 12h standby through Friday',               '2026-05-22',   '2021-08', '2h ago',     6),
    ('Eitan Cohen',    'EC', 2, '+972 52-654-1109', 'available',   null,                                          null,           '2021-03', '1d ago',     5),
    ('Noa Shapira',    'NS', 3, '+972 54-339-7720', 'released',    'Released this morning, back home',            null,           '2022-01', '6h ago',     7),
    ('Avi Mizrahi',    'AM', 4, '+972 53-115-4408', 'available',   null,                                          null,           '2021-05', 'active now', 3),
    ('Maya Ben-David', 'MB', 5, '+972 54-008-2287', 'unavailable', 'Abroad — research conference',                '2026-08-12',   '2022-04', '3d ago',     2),
    ('Itai Rosen',     'IR', 6, '+972 52-771-3309', 'available',   null,                                          null,           '2021-07', '4h ago',     4),
    ('Shira Peretz',   'SP', 7, '+972 50-462-7785', 'standby',     'Pinning for night call-up',                   '2026-05-18',   '2021-09', 'active now', 5),
    ('Daniel Katz',    'DK', 0, '+972 54-902-1126', 'available',   null,                                          null,           '2021-03', 'active now', 6),
    ('Lior Friedman',  'LF', 1, '+972 53-200-8841', 'available',   null,                                          null,           '2022-02', '1d ago',     4),
    ('Roni Bar-On',    'RB', 2, '+972 54-115-6601', 'released',    'Released yesterday',                          null,           '2021-04', '12h ago',    7),
    ('Uri Goldstein',  'UG', 3, '+972 52-441-9908', 'available',   null,                                          null,           '2022-06', 'active now', 3),
    ('Tal Shemesh',    'TS', 4, '+972 50-789-2244', 'standby',     'On-call from base',                           '2026-05-20',   '2021-11', '1h ago',     5),
    ('Omer Halevi',    'OH', 5, '+972 54-660-3317', 'available',   null,                                          null,           '2021-06', 'active now', 4),
    ('Gal Adler',      'GA', 6, '+972 52-009-4488', 'unavailable', 'Exam period (final year, Hebrew U)',           '2026-06-28',   '2022-09', '5d ago',     2),
    ('Yair Ben-Ami',   'YB', 7, '+972 53-118-7706', 'available',   null,                                          null,           '2022-04', '8h ago',     3),
    ('Hadar Stern',    'HS', 0, '+972 50-228-5520', 'released',    'Released — three days off',                   null,           '2021-10', 'yesterday',  6),
    ('Amit Sapir',     'AS', 1, '+972 54-771-6644', 'standby',     'Ready, awaiting brief',                       '2026-05-21',   '2022-03', '30m ago',    4),
    ('Nadav Reichman', 'NR', 2, '+972 53-665-8821', 'available',   null,                                          null,           '2021-08', 'active now', 5),
    ('Idan Carmel',    'IC', 3, '+972 54-449-1129', 'available',   null,                                          null,           '2022-07', '4h ago',     3),
    ('Liat Geller',    'LG', 4, '+972 50-880-3309', 'available',   null,                                          null,           '2021-12', 'active now', 4),
    ('Ben Naveh',      'BN', 5, '+972 52-339-7740', 'available',   null,                                          null,           '2022-05', '2h ago',     3),
    ('Rotem Avidan',   'RA', 6, '+972 54-200-1185', 'unavailable', 'Wedding, away',                               '2026-05-19',   '2021-07', '1d ago',     5),
    ('Shai Klein',     'SK', 7, '+972 53-880-2204', 'available',   null,                                          null,           '2022-10', 'active now', 2)
  ) as m(name, initials, tone, phone, status, note, until, joined, last_seen, calls)
  returning id, division_id, name
)

-- ── 6. team_members (commanders + soldiers)
insert into team_members (team_id, member_id, role)
select
  team.id,
  members_ins.id,
  case members_ins.name
    when 'Yoni Avraham' then 'commander'::team_role_enum
    when 'Daniel Katz'  then 'commander'::team_role_enum
    else                     'soldier'::team_role_enum
  end
from team, members_ins;

-- ── 7. Member skills (name-pair join)
insert into member_skills (member_id, skill_id)
select m.id, s.id
from members m
join skills s on s.division_id = m.division_id
join (values
  ('Yoni Avraham',   'Urban Combat'),    ('Yoni Avraham',   'Night Ops'),      ('Yoni Avraham',   'Arabic'),
  ('Tamar Levi',     'Combat Medic Cert.'), ('Tamar Levi',  'First Aid Cert.'), ('Tamar Levi',     'English (Fluent)'),
  ('Eitan Cohen',    'HMMWV'),            ('Eitan Cohen',    'Heavy Truck'),    ('Eitan Cohen',    'Mechanic'),       ('Eitan Cohen',    'Night Ops'),
  ('Noa Shapira',    'Comms Tech'),       ('Noa Shapira',    'Cyber'),          ('Noa Shapira',    'English (Fluent)'),
  ('Avi Mizrahi',    'Sniper Cert.'),     ('Avi Mizrahi',    'Night Ops'),      ('Avi Mizrahi',    'Urban Combat'),
  ('Maya Ben-David', 'GIS / Maps'),       ('Maya Ben-David', 'English (Fluent)'), ('Maya Ben-David','Arabic'),       ('Maya Ben-David', 'Cyber'),
  ('Itai Rosen',     'Urban Combat'),     ('Itai Rosen',     'Mechanic'),       ('Itai Rosen',     'Night Ops'),
  ('Shira Peretz',   'Combat Medic Cert.'), ('Shira Peretz', 'First Aid Cert.'), ('Shira Peretz',  'Night Ops'),
  ('Daniel Katz',    'Urban Combat'),     ('Daniel Katz',    'Krav Maga Inst.'), ('Daniel Katz',   'Arabic'),
  ('Lior Friedman',  'Night Ops'),        ('Lior Friedman',  'Urban Combat'),
  ('Roni Bar-On',    'Heavy Truck'),      ('Roni Bar-On',    'Urban Combat'),
  ('Uri Goldstein',  'Urban Combat'),     ('Uri Goldstein',  'Russian'),
  ('Tal Shemesh',    'Drone Op.'),        ('Tal Shemesh',    'Comms Tech'),     ('Tal Shemesh',    'English (Fluent)'),
  ('Omer Halevi',    'Heavy Truck'),      ('Omer Halevi',    'Mechanic'),
  ('Gal Adler',      'Comms Tech'),       ('Gal Adler',      'English (Fluent)'),
  ('Yair Ben-Ami',   'Urban Combat'),     ('Yair Ben-Ami',   'Night Ops'),
  ('Hadar Stern',    'Combat Medic Cert.'), ('Hadar Stern',  'First Aid Cert.'), ('Hadar Stern',   'Krav Maga Inst.'),
  ('Amit Sapir',     'Sniper Cert.'),     ('Amit Sapir',     'Night Ops'),
  ('Nadav Reichman', 'Mechanic'),         ('Nadav Reichman', 'Urban Combat'),   ('Nadav Reichman', 'Night Ops'),
  ('Idan Carmel',    'Urban Combat'),     ('Idan Carmel',    'Russian'),
  ('Liat Geller',    'GIS / Maps'),       ('Liat Geller',    'Arabic'),         ('Liat Geller',    'English (Fluent)'), ('Liat Geller', 'Cyber'),
  ('Ben Naveh',      'Heavy Truck'),      ('Ben Naveh',      'Mechanic'),
  ('Rotem Avidan',   'Urban Combat'),     ('Rotem Avidan',   'Mechanic'),
  ('Shai Klein',     'Urban Combat'),     ('Shai Klein',     'Krav Maga Inst.')
) as ms(member_name, skill_name) on ms.member_name = m.name and ms.skill_name = s.name;

-- ── 8. Skill levels (senior overrides)
update member_skills ms set level = 'senior'
from members m, skills s
where ms.member_id = m.id and ms.skill_id = s.id
  and (m.name, s.name) in (
    ('Yoni Avraham',   'Urban Combat'),
    ('Yoni Avraham',   'Night Ops'),
    ('Daniel Katz',    'Urban Combat'),
    ('Daniel Katz',    'Krav Maga Inst.'),
    ('Tamar Levi',     'Combat Medic Cert.'),
    ('Shira Peretz',   'Combat Medic Cert.'),
    ('Avi Mizrahi',    'Sniper Cert.'),
    ('Amit Sapir',     'Sniper Cert.'),
    ('Maya Ben-David', 'GIS / Maps'),
    ('Liat Geller',    'GIS / Maps'),
    ('Eitan Cohen',    'Heavy Truck'),
    ('Tal Shemesh',    'Drone Op.'),
    ('Noa Shapira',    'Cyber'),
    ('Hadar Stern',    'Krav Maga Inst.')
  );

-- Junior overrides
update member_skills ms set level = 'junior'
from members m, skills s
where ms.member_id = m.id and ms.skill_id = s.id
  and (m.name, s.name) in (
    ('Uri Goldstein',  'Russian'),
    ('Idan Carmel',    'Russian'),
    ('Yair Ben-Ami',   'Night Ops'),
    ('Shai Klein',     'Krav Maga Inst.'),
    ('Lior Friedman',  'Night Ops'),
    ('Ben Naveh',      'Heavy Truck'),
    ('Gal Adler',      'Comms Tech'),
    ('Rotem Avidan',   'Mechanic')
  );

-- ── 9. Slots (scoped to team)
insert into slots (team_id, title, urgent, state, start_at, end_at, duration, location, needed)
select t.id, s.title, s.urgent, 'published'::slot_state_enum,
       s.start_at::timestamptz, s.end_at::timestamptz, s.duration, s.location, s.needed
from teams t, (values
  ('Northern QRF — Sector 4',            true,  '2026-05-15T19:00:00Z', '2026-05-16T07:00:00Z', '12h', 'Tzomet Bilu staging',  6),
  ('Outpost Rotation — Givat HaShlosha', false, '2026-05-19T03:00:00Z', '2026-05-22T03:00:00Z', '72h', 'Givat HaShlosha',     4),
  ('Convoy escort — Route 90',           false, '2026-05-21T01:30:00Z', '2026-05-21T11:30:00Z', '10h', 'Beit She''an staging', 3)
) as s(title, urgent, start_at, end_at, duration, location, needed);

-- ── 10. Slot skills
insert into slot_skills (slot_id, skill_id)
select sl.id, sk.id
from slots sl
join teams t on t.id = sl.team_id
join skills sk on sk.division_id = t.division_id
join (values
  ('Northern QRF — Sector 4',  'Night Ops'),
  ('Convoy escort — Route 90', 'Heavy Truck')
) as ss(slot_title, skill_name) on ss.slot_title = sl.title and ss.skill_name = sk.name;

-- Northern QRF requires senior Night Ops
update slot_skills ss set min_level = 'senior'
from slots sl, skills sk
where ss.slot_id = sl.id and ss.skill_id = sk.id
  and sl.title = 'Northern QRF — Sector 4' and sk.name = 'Night Ops';

-- ── 11. Slot assignees
insert into slot_assignees (slot_id, member_id)
select sl.id, m.id
from slots sl
join teams t on t.id = sl.team_id
join team_members tm on tm.team_id = t.id
join members m on m.id = tm.member_id
join (values
  ('Northern QRF — Sector 4',            'Yoni Avraham'),
  ('Northern QRF — Sector 4',            'Avi Mizrahi'),
  ('Outpost Rotation — Givat HaShlosha', 'Avi Mizrahi'),
  ('Outpost Rotation — Givat HaShlosha', 'Uri Goldstein'),
  ('Outpost Rotation — Givat HaShlosha', 'Yair Ben-Ami'),
  ('Outpost Rotation — Givat HaShlosha', 'Idan Carmel'),
  ('Convoy escort — Route 90',           'Omer Halevi')
) as sa(slot_title, member_name) on sa.slot_title = sl.title and sa.member_name = m.name;

-- ── 12. Activity log (scoped to team)
insert into activity_log (team_id, actor_name, verb, what, tone, created_at)
select t.id, actor, verb, what, tone, now() - (mins || ' minutes')::interval
from teams t, (values
  ('You',           'posted an urgent call-up',  'Northern QRF, 6 needed',            'urgent', 12),
  ('Tamar Levi',    'set status to',             'Standby (through Fri)',              'accent', 32),
  ('Eitan Cohen',   'updated phone number',      null,                                 null,     60),
  ('Daniel Katz',   'assigned',                  'Avi Mizrahi to Outpost Rotation',   'accent', 120),
  ('Noa Shapira',   'set status to',             'Released',                           null,     240),
  ('Maya Ben-David','set status to',             'Unavailable (abroad)',               null,     1440),
  ('Hadar Stern',   'joined the unit',           null,                                 'accent', 4320)
) as a(actor, verb, what, tone, mins);

-- ── 13. Deployment window (Avi Mizrahi, Spring stretch, scoped to team)
with avi as (
  select m.id as member_id, tm.team_id
  from members m
  join team_members tm on tm.member_id = m.id
  where m.name = 'Avi Mizrahi'
  limit 1
),
creator as (
  select id from members where name = 'Yoni Avraham' limit 1
),
w as (
  insert into deployment_windows (member_id, team_id, label, start_date, end_date, notes, state, created_by)
  select avi.member_id, avi.team_id, 'Spring stretch', date '2026-05-10', date '2026-05-31',
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
  (date '2026-05-10', 'approved'::pick_state_enum,  null,                   'good, you anchor day 1'),
  (date '2026-05-11', 'approved'::pick_state_enum,  null,                   null),
  (date '2026-05-12', 'approved'::pick_state_enum,  null,                   null),
  (date '2026-05-17', 'proposed'::pick_state_enum,  'family obligation am', null),
  (date '2026-05-18', 'proposed'::pick_state_enum,  null,                   null),
  (date '2026-05-24', 'rejected'::pick_state_enum,  null,                   'need you off — overlap with Uri'),
  (date '2026-05-25', 'proposed'::pick_state_enum,  null,                   null)
) as p(d, st, rnote, cnote);

-- ── Division admin seed: mark Yoni Avraham as division admin
update members set is_division_admin = true where name = 'Yoni Avraham';

-- ═════════════════════════════════════════════════════════════════════════
-- Multi-project / multi-team extension
-- Adds:
--   • Project 'Mahlaka 7' (sibling of Carmel under same division)
--       └─ Team 'Alpha-7'
--   • Team 'Bravo-6' under the existing 'Carmel' project (project has 2 teams)
--   • New members + memberships + slots + activity for each new team
--   • One cross-team member (in Bravo-6 AND Alpha-7)
--   • Unclaimed (auth_user_id NULL) members in both new teams
-- ═════════════════════════════════════════════════════════════════════════

-- ── A. New project 'Mahlaka 7' under existing 'Mahlaka 6' division
insert into projects (division_id, name)
select id, 'Mahlaka 7' from divisions where name = 'Mahlaka 6';

-- ── B. New team 'Alpha-7' under 'Mahlaka 7'
insert into teams (project_id, division_id, name, short_name, crest, invite_code, established)
select p.id, p.division_id, 'Mahlaka 7 — Alpha', 'Alpha-7', 'A7', 'alph-2026', 'Established 2024'
from projects p
where p.name = 'Mahlaka 7';

-- ── C. New team 'Bravo-6' under existing 'Carmel'
insert into teams (project_id, division_id, name, short_name, crest, invite_code, established)
select p.id, p.division_id, 'Mahlaka 6 — Bravo', 'Bravo-6', 'B6', 'brav-2026', 'Established 2023'
from projects p
where p.name = 'Carmel';

-- ── D. New members for Bravo-6 (5 members, all in 'Mahlaka 6' division)
insert into members (division_id, name, initials, tone, phone, status, status_note, status_until, joined, last_seen, calls_this_year)
select d.id,
       m.name, m.initials, m.tone, m.phone,
       m.status::status_enum, m.note, m.until,
       m.joined, m.last_seen, m.calls
from divisions d, (values
  ('Asaf Doron',     'AD', 0, '+972 54-330-1100', 'available',   null,                              null::date,   '2022-02', 'active now', 3),
  ('Mor Kaplan',     'MK', 1, '+972 50-441-2233', 'standby',     'Pre-positioned at base',          '2026-05-20', '2021-09', '1h ago',     5),
  ('Erez Halperin',  'EH', 2, '+972 52-558-9012', 'available',   null,                              null,         '2021-06', '3h ago',     4),
  ('Sivan Roth',     'SR', 3, '+972 54-771-3344', 'unavailable', 'Reserves leave — family event',   '2026-06-01', '2022-08', '2d ago',     2),
  ('Ofir Lavi',      'OL', 4, '+972 53-220-5566', 'available',   null,                              null,         '2022-11', '5h ago',     3)
) as m(name, initials, tone, phone, status, note, until, joined, last_seen, calls)
where d.name = 'Mahlaka 6';

-- ── E. New members for Alpha-7 (5 members, same division)
insert into members (division_id, name, initials, tone, phone, status, status_note, status_until, joined, last_seen, calls_this_year)
select d.id,
       m.name, m.initials, m.tone, m.phone,
       m.status::status_enum, m.note, m.until,
       m.joined, m.last_seen, m.calls
from divisions d, (values
  ('Tomer Bachar',   'TB', 5, '+972 54-887-2210', 'available',   null,                              null::date,   '2023-01', 'active now', 2),
  ('Yael Hadar',     'YH', 6, '+972 50-115-9933', 'available',   null,                              null,         '2023-04', '2h ago',     1),
  ('Nimrod Saban',   'NM', 7, '+972 52-660-4477', 'standby',     'Held back as Alpha reserve',      '2026-05-23', '2023-02', '6h ago',     3),
  ('Yarden Mualem',  'YM', 0, '+972 54-009-7711', 'available',   null,                              null,         '2023-06', '1d ago',     2),
  ('Eden Tzur',      'ET', 1, '+972 53-440-8822', 'released',    'Released this week',              null,         '2023-03', '4h ago',     4)
) as m(name, initials, tone, phone, status, note, until, joined, last_seen, calls)
where d.name = 'Mahlaka 6';

-- ── F. team_members for Bravo-6
-- Asaf Doron = commander. Erez Halperin will be cross-team (also added to Alpha-7 below).
insert into team_members (team_id, member_id, role)
select t.id, m.id,
  case m.name
    when 'Asaf Doron' then 'commander'::team_role_enum
    else                   'soldier'::team_role_enum
  end
from teams t, members m
where t.short_name = 'Bravo-6'
  and m.name in ('Asaf Doron', 'Mor Kaplan', 'Erez Halperin', 'Sivan Roth', 'Ofir Lavi');

-- ── G. team_members for Alpha-7
-- Tomer Bachar = commander. Erez Halperin appears here as soldier (cross-team).
insert into team_members (team_id, member_id, role)
select t.id, m.id,
  case m.name
    when 'Tomer Bachar'  then 'commander'::team_role_enum
    when 'Erez Halperin' then 'soldier'::team_role_enum
    else                      'soldier'::team_role_enum
  end
from teams t, members m
where t.short_name = 'Alpha-7'
  and m.name in ('Tomer Bachar', 'Yael Hadar', 'Nimrod Saban', 'Yarden Mualem', 'Eden Tzur', 'Erez Halperin');

-- ── H. Member skills for new members (reuse division skills)
insert into member_skills (member_id, skill_id)
select m.id, s.id
from members m
join skills s on s.division_id = m.division_id
join (values
  ('Asaf Doron',     'Urban Combat'),
  ('Asaf Doron',     'Krav Maga Inst.'),
  ('Asaf Doron',     'Night Ops'),
  ('Mor Kaplan',     'Drone Op.'),
  ('Mor Kaplan',     'Comms Tech'),
  ('Erez Halperin',  'HMMWV'),
  ('Erez Halperin',  'Heavy Truck'),
  ('Erez Halperin',  'Mechanic'),
  ('Sivan Roth',     'First Aid Cert.'),
  ('Sivan Roth',     'English (Fluent)'),
  ('Ofir Lavi',      'Cyber'),
  ('Ofir Lavi',      'GIS / Maps'),
  ('Tomer Bachar',   'Urban Combat'),
  ('Tomer Bachar',   'Sniper Cert.'),
  ('Tomer Bachar',   'Night Ops'),
  ('Yael Hadar',     'Combat Medic Cert.'),
  ('Yael Hadar',     'First Aid Cert.'),
  ('Nimrod Saban',   'Drone Op.'),
  ('Nimrod Saban',   'Comms Tech'),
  ('Nimrod Saban',   'English (Fluent)'),
  ('Yarden Mualem',  'Arabic'),
  ('Yarden Mualem',  'GIS / Maps'),
  ('Eden Tzur',      'Russian'),
  ('Eden Tzur',      'Urban Combat')
) as ms(member_name, skill_name) on ms.member_name = m.name and ms.skill_name = s.name;

-- Senior overrides for new members
update member_skills ms set level = 'senior'
from members m, skills s
where ms.member_id = m.id and ms.skill_id = s.id
  and (m.name, s.name) in (
    ('Asaf Doron',     'Krav Maga Inst.'),
    ('Asaf Doron',     'Urban Combat'),
    ('Mor Kaplan',     'Drone Op.'),
    ('Tomer Bachar',   'Sniper Cert.'),
    ('Yael Hadar',     'Combat Medic Cert.'),
    ('Erez Halperin',  'Heavy Truck')
  );

-- Junior overrides
update member_skills ms set level = 'junior'
from members m, skills s
where ms.member_id = m.id and ms.skill_id = s.id
  and (m.name, s.name) in (
    ('Eden Tzur',      'Russian'),
    ('Nimrod Saban',   'Comms Tech'),
    ('Yarden Mualem',  'Arabic')
  );

-- ── I. Slots for Bravo-6 (2 published + 1 draft)
insert into slots (team_id, title, urgent, state, start_at, end_at, duration, location, needed)
select t.id, s.title, s.urgent, s.state::slot_state_enum,
       s.start_at::timestamptz, s.end_at::timestamptz, s.duration, s.location, s.needed
from teams t, (values
  ('Bravo gate watch — North Camp',   true,  'published', '2026-05-17T20:00:00Z', '2026-05-18T08:00:00Z', '12h', 'North Camp gate',     4),
  ('Bravo recon — Ridge 7',           false, 'published', '2026-05-23T05:00:00Z', '2026-05-23T17:00:00Z', '12h', 'Ridge 7 trailhead',   3),
  ('Bravo training — sim day',        false, 'draft',     '2026-06-02T07:00:00Z', '2026-06-02T17:00:00Z', '10h', 'Tze''elim sim range', 5)
) as s(title, urgent, state, start_at, end_at, duration, location, needed)
where t.short_name = 'Bravo-6';

-- ── J. Slots for Alpha-7 (2 published + 1 draft)
insert into slots (team_id, title, urgent, state, start_at, end_at, duration, location, needed)
select t.id, s.title, s.urgent, s.state::slot_state_enum,
       s.start_at::timestamptz, s.end_at::timestamptz, s.duration, s.location, s.needed
from teams t, (values
  ('Alpha drone sweep — Sector 2',    true,  'published', '2026-05-18T22:00:00Z', '2026-05-19T04:00:00Z', '6h',  'Sector 2 OP',         3),
  ('Alpha perimeter — Outpost Lev',   false, 'published', '2026-05-25T06:00:00Z', '2026-05-26T06:00:00Z', '24h', 'Outpost Lev',         5),
  ('Alpha staff prep — HQ briefing',  false, 'draft',     '2026-06-04T08:00:00Z', '2026-06-04T12:00:00Z', '4h',  'HQ briefing room',    2)
) as s(title, urgent, state, start_at, end_at, duration, location, needed)
where t.short_name = 'Alpha-7';

-- ── K. Slot skill requirements
insert into slot_skills (slot_id, skill_id)
select sl.id, sk.id
from slots sl
join teams t on t.id = sl.team_id
join skills sk on sk.division_id = t.division_id
join (values
  ('Bravo gate watch — North Camp',  'Night Ops'),
  ('Bravo gate watch — North Camp',  'Krav Maga Inst.'),
  ('Bravo recon — Ridge 7',          'Urban Combat'),
  ('Alpha drone sweep — Sector 2',   'Drone Op.'),
  ('Alpha drone sweep — Sector 2',   'Night Ops'),
  ('Alpha perimeter — Outpost Lev',  'Urban Combat')
) as ss(slot_title, skill_name) on ss.slot_title = sl.title and ss.skill_name = sk.name;

-- Senior requirement: Alpha drone sweep needs senior Drone Op.
update slot_skills ss set min_level = 'senior'
from slots sl, skills sk
where ss.slot_id = sl.id and ss.skill_id = sk.id
  and sl.title = 'Alpha drone sweep — Sector 2' and sk.name = 'Drone Op.';

-- ── L. Activity log for Bravo-6
insert into activity_log (team_id, actor_name, verb, what, tone, created_at)
select t.id, actor, verb, what, tone, now() - (mins || ' minutes')::interval
from teams t, (values
  ('Asaf Doron',    'posted an urgent call-up',  'Bravo gate watch tonight',         'urgent', 18),
  ('Mor Kaplan',    'set status to',             'Standby',                          'accent', 45),
  ('Erez Halperin', 'joined the team',           null,                               'accent', 220),
  ('Sivan Roth',    'set status to',             'Unavailable (family event)',       null,     900),
  ('Ofir Lavi',     'updated phone number',      null,                               null,     2880)
) as a(actor, verb, what, tone, mins)
where t.short_name = 'Bravo-6';

-- ── M. Activity log for Alpha-7
insert into activity_log (team_id, actor_name, verb, what, tone, created_at)
select t.id, actor, verb, what, tone, now() - (mins || ' minutes')::interval
from teams t, (values
  ('Tomer Bachar',   'posted an urgent call-up',  'Alpha drone sweep, 3 needed',     'urgent', 22),
  ('Nimrod Saban',   'set status to',             'Standby',                          'accent', 75),
  ('Yael Hadar',     'joined the team',           null,                               'accent', 360),
  ('Eden Tzur',      'set status to',             'Released',                         null,     1200),
  ('Yarden Mualem',  'updated phone number',      null,                               null,     2160),
  ('Erez Halperin',  'joined the team',           '(cross-team from Bravo-6)',        'accent', 480)
) as a(actor, verb, what, tone, mins)
where t.short_name = 'Alpha-7';

-- ── N. Slot assignees for new teams
insert into slot_assignees (slot_id, member_id)
select sl.id, m.id
from slots sl
join teams t on t.id = sl.team_id
join team_members tm on tm.team_id = t.id
join members m on m.id = tm.member_id
join (values
  ('Bravo gate watch — North Camp',  'Asaf Doron'),
  ('Bravo gate watch — North Camp',  'Mor Kaplan'),
  ('Bravo recon — Ridge 7',          'Erez Halperin'),
  ('Alpha drone sweep — Sector 2',   'Tomer Bachar'),
  ('Alpha drone sweep — Sector 2',   'Nimrod Saban'),
  ('Alpha perimeter — Outpost Lev',  'Yarden Mualem')
) as sa(slot_title, member_name) on sa.slot_title = sl.title and sa.member_name = m.name;

-- ── O. Invite expiry backfill (PRD §7.1 default 7 days)
update teams set invite_expires_at = now() + interval '7 days' where invite_code is not null;

-- ── P. Auth users for integration tests (deterministic UUIDs, RLS tightening)
-- These rows let tests mint JWTs without a real OAuth flow.
-- Commander: Yoni Avraham — auth UUID a0000000-0000-0000-0000-000000000001
-- Soldier:   Eitan Cohen  — auth UUID b0000000-0000-0000-0000-000000000001
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'commander-yoni@test.local',
    crypt('unused', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false, '', '', '', ''
  ),
  (
    'b0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'soldier-eitan@test.local',
    crypt('unused', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false, '', '', '', ''
  )
on conflict (id) do nothing;

-- Link auth users to member rows
update members set auth_user_id = 'a0000000-0000-0000-0000-000000000001'
where name = 'Yoni Avraham';

update members set auth_user_id = 'b0000000-0000-0000-0000-000000000001'
where name = 'Eitan Cohen';

