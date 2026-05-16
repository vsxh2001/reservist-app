-- Seed: Mahlaka 6 — Carmel (translated from reference/data.js)

with u as (
  insert into units (name, short_name, crest, established, invite_code)
  values ('Mahlaka 6 — Carmel', 'Mahlaka 6', 'M6', 'Established 2021', 'carmel-6-J3xK')
  returning id
)
insert into roles (unit_id, name, sort_idx)
select u.id, name, idx from u, (values
  ('Squad Leader', 0),
  ('Rifleman', 1),
  ('Combat Medic', 2),
  ('Combat Engineer', 3),
  ('Sharpshooter', 4),
  ('MAG Gunner', 5),
  ('RPG Gunner', 6),
  ('Driver', 7),
  ('Signals', 8),
  ('Drone Operator', 9),
  ('Intel Analyst', 10),
  ('Logistics', 11)
) as t(name, idx);

insert into skills (unit_id, name)
select (select id from units), name from (values
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
) as t(name);

-- Members: name, initials, tone, role, is_commander, phone, status, note, until, joined, last_seen, calls, skills(csv)
insert into members (unit_id, name, initials, tone, role_id, is_commander, phone, status, status_note, status_until, joined, last_seen, calls_this_year)
select
  u.id, m.name, m.initials, m.tone,
  (select id from roles where unit_id = u.id and name = m.role),
  m.is_commander, m.phone, m.status::status_enum, m.note, m.until,
  m.joined, m.last_seen, m.calls
from (select id from units) u,
(values
  ('Yoni Avraham','YA',0,'Squad Leader',true,'+972 54-221-8843','available','Returning from south, ETA 18:00',null::date,'2021-03','active now',4),
  ('Tamar Levi','TL',1,'Combat Medic',false,'+972 50-887-4421','standby','On 12h standby through Friday','2026-05-22','2021-08','2h ago',6),
  ('Eitan Cohen','EC',2,'Driver',false,'+972 52-654-1109','available',null,null,'2021-03','1d ago',5),
  ('Noa Shapira','NS',3,'Signals',false,'+972 54-339-7720','released','Released this morning, back home',null,'2022-01','6h ago',7),
  ('Avi Mizrahi','AM',4,'Sharpshooter',false,'+972 53-115-4408','available',null,null,'2021-05','active now',3),
  ('Maya Ben-David','MB',5,'Intel Analyst',false,'+972 54-008-2287','unavailable','Abroad — research conference','2026-08-12','2022-04','3d ago',2),
  ('Itai Rosen','IR',6,'Combat Engineer',false,'+972 52-771-3309','available',null,null,'2021-07','4h ago',4),
  ('Shira Peretz','SP',7,'Combat Medic',false,'+972 50-462-7785','standby','Pinning for night call-up','2026-05-18','2021-09','active now',5),
  ('Daniel Katz','DK',0,'Squad Leader',true,'+972 54-902-1126','available',null,null,'2021-03','active now',6),
  ('Lior Friedman','LF',1,'RPG Gunner',false,'+972 53-200-8841','available',null,null,'2022-02','1d ago',4),
  ('Roni Bar-On','RB',2,'MAG Gunner',false,'+972 54-115-6601','released','Released yesterday',null,'2021-04','12h ago',7),
  ('Uri Goldstein','UG',3,'Rifleman',false,'+972 52-441-9908','available',null,null,'2022-06','active now',3),
  ('Tal Shemesh','TS',4,'Drone Operator',false,'+972 50-789-2244','standby','On-call from base','2026-05-20','2021-11','1h ago',5),
  ('Omer Halevi','OH',5,'Driver',false,'+972 54-660-3317','available',null,null,'2021-06','active now',4),
  ('Gal Adler','GA',6,'Signals',false,'+972 52-009-4488','unavailable','Exam period (final year, Hebrew U)','2026-06-28','2022-09','5d ago',2),
  ('Yair Ben-Ami','YB',7,'Rifleman',false,'+972 53-118-7706','available',null,null,'2022-04','8h ago',3),
  ('Hadar Stern','HS',0,'Combat Medic',false,'+972 50-228-5520','released','Released — three days off',null,'2021-10','yesterday',6),
  ('Amit Sapir','AS',1,'Sharpshooter',false,'+972 54-771-6644','standby','Ready, awaiting brief','2026-05-21','2022-03','30m ago',4),
  ('Nadav Reichman','NR',2,'Combat Engineer',false,'+972 53-665-8821','available',null,null,'2021-08','active now',5),
  ('Idan Carmel','IC',3,'Rifleman',false,'+972 54-449-1129','available',null,null,'2022-07','4h ago',3),
  ('Liat Geller','LG',4,'Intel Analyst',false,'+972 50-880-3309','available',null,null,'2021-12','active now',4),
  ('Ben Naveh','BN',5,'Logistics',false,'+972 52-339-7740','available',null,null,'2022-05','2h ago',3),
  ('Rotem Avidan','RA',6,'Combat Engineer',false,'+972 54-200-1185','unavailable','Wedding, away','2026-05-19','2021-07','1d ago',5),
  ('Shai Klein','SK',7,'Rifleman',false,'+972 53-880-2204','available',null,null,'2022-10','active now',2)
) as m(name, initials, tone, role, is_commander, phone, status, note, until, joined, last_seen, calls);

-- Member skills (name pairs)
insert into member_skills (member_id, skill_id)
select m.id, s.id
from members m
join skills s on s.unit_id = m.unit_id
join (values
  ('Yoni Avraham','Urban Combat'),('Yoni Avraham','Night Ops'),('Yoni Avraham','Arabic'),
  ('Tamar Levi','Combat Medic Cert.'),('Tamar Levi','First Aid Cert.'),('Tamar Levi','English (Fluent)'),
  ('Eitan Cohen','HMMWV'),('Eitan Cohen','Heavy Truck'),('Eitan Cohen','Mechanic'),('Eitan Cohen','Night Ops'),
  ('Noa Shapira','Comms Tech'),('Noa Shapira','Cyber'),('Noa Shapira','English (Fluent)'),
  ('Avi Mizrahi','Sniper Cert.'),('Avi Mizrahi','Night Ops'),('Avi Mizrahi','Urban Combat'),
  ('Maya Ben-David','GIS / Maps'),('Maya Ben-David','English (Fluent)'),('Maya Ben-David','Arabic'),('Maya Ben-David','Cyber'),
  ('Itai Rosen','Urban Combat'),('Itai Rosen','Mechanic'),('Itai Rosen','Night Ops'),
  ('Shira Peretz','Combat Medic Cert.'),('Shira Peretz','First Aid Cert.'),('Shira Peretz','Night Ops'),
  ('Daniel Katz','Urban Combat'),('Daniel Katz','Krav Maga Inst.'),('Daniel Katz','Arabic'),
  ('Lior Friedman','Night Ops'),('Lior Friedman','Urban Combat'),
  ('Roni Bar-On','Heavy Truck'),('Roni Bar-On','Urban Combat'),
  ('Uri Goldstein','Urban Combat'),('Uri Goldstein','Russian'),
  ('Tal Shemesh','Drone Op.'),('Tal Shemesh','Comms Tech'),('Tal Shemesh','English (Fluent)'),
  ('Omer Halevi','Heavy Truck'),('Omer Halevi','Mechanic'),
  ('Gal Adler','Comms Tech'),('Gal Adler','English (Fluent)'),
  ('Yair Ben-Ami','Urban Combat'),('Yair Ben-Ami','Night Ops'),
  ('Hadar Stern','Combat Medic Cert.'),('Hadar Stern','First Aid Cert.'),('Hadar Stern','Krav Maga Inst.'),
  ('Amit Sapir','Sniper Cert.'),('Amit Sapir','Night Ops'),
  ('Nadav Reichman','Mechanic'),('Nadav Reichman','Urban Combat'),('Nadav Reichman','Night Ops'),
  ('Idan Carmel','Urban Combat'),('Idan Carmel','Russian'),
  ('Liat Geller','GIS / Maps'),('Liat Geller','Arabic'),('Liat Geller','English (Fluent)'),('Liat Geller','Cyber'),
  ('Ben Naveh','Heavy Truck'),('Ben Naveh','Mechanic'),
  ('Rotem Avidan','Urban Combat'),('Rotem Avidan','Mechanic'),
  ('Shai Klein','Urban Combat'),('Shai Klein','Krav Maga Inst.')
) as ms(member_name, skill_name) on ms.member_name = m.name and ms.skill_name = s.name;

-- Seed duty slots (PRD §7.5)
with u as (select id from units)
insert into slots (unit_id, title, urgent, state, start_at, end_at, duration, location, role_id, needed)
select
  u.id, s.title, s.urgent, 'published'::slot_state_enum,
  s.start_at::timestamptz, s.end_at::timestamptz, s.duration, s.location,
  (select id from roles where unit_id = u.id and name = s.role), s.needed
from u, (values
  ('Northern QRF — Sector 4',         true,  '2026-05-15T19:00:00Z', '2026-05-16T07:00:00Z', '12h', 'Tzomet Bilu staging',  'Rifleman', 6),
  ('Outpost Rotation — Givat HaShlosha', false, '2026-05-19T03:00:00Z', '2026-05-22T03:00:00Z', '72h', 'Givat HaShlosha',     'Rifleman', 4),
  ('Convoy escort — Route 90',        false, '2026-05-21T01:30:00Z', '2026-05-21T11:30:00Z', '10h', 'Beit She''an staging', 'Driver',   3)
) as s(title, urgent, start_at, end_at, duration, location, role, needed);

insert into slot_skills (slot_id, skill_id)
select sl.id, sk.id
from slots sl
join skills sk on sk.unit_id = sl.unit_id
join (values
  ('Northern QRF — Sector 4', 'Night Ops'),
  ('Convoy escort — Route 90', 'Heavy Truck')
) as ss(slot_title, skill_name) on ss.slot_title = sl.title and ss.skill_name = sk.name;

insert into slot_assignees (slot_id, member_id)
select sl.id, m.id
from slots sl
join members m on m.unit_id = sl.unit_id
join (values
  ('Northern QRF — Sector 4', 'Yoni Avraham'),
  ('Northern QRF — Sector 4', 'Avi Mizrahi'),
  ('Outpost Rotation — Givat HaShlosha', 'Avi Mizrahi'),
  ('Outpost Rotation — Givat HaShlosha', 'Uri Goldstein'),
  ('Outpost Rotation — Givat HaShlosha', 'Yair Ben-Ami'),
  ('Outpost Rotation — Givat HaShlosha', 'Idan Carmel'),
  ('Convoy escort — Route 90', 'Omer Halevi')
) as sa(slot_title, member_name) on sa.slot_title = sl.title and sa.member_name = m.name;

-- Skill levels: sprinkle senior/junior over the intermediate default for demo realism.
update member_skills ms set level = 'senior'
from members m, skills s
where ms.member_id = m.id and ms.skill_id = s.id
  and (m.name, s.name) in (
    ('Yoni Avraham', 'Urban Combat'),
    ('Yoni Avraham', 'Night Ops'),
    ('Daniel Katz', 'Urban Combat'),
    ('Daniel Katz', 'Krav Maga Inst.'),
    ('Tamar Levi', 'Combat Medic Cert.'),
    ('Shira Peretz', 'Combat Medic Cert.'),
    ('Avi Mizrahi', 'Sniper Cert.'),
    ('Amit Sapir', 'Sniper Cert.'),
    ('Maya Ben-David', 'GIS / Maps'),
    ('Liat Geller', 'GIS / Maps'),
    ('Eitan Cohen', 'Heavy Truck'),
    ('Tal Shemesh', 'Drone Op.'),
    ('Noa Shapira', 'Cyber'),
    ('Hadar Stern', 'Krav Maga Inst.')
  );

update member_skills ms set level = 'junior'
from members m, skills s
where ms.member_id = m.id and ms.skill_id = s.id
  and (m.name, s.name) in (
    ('Uri Goldstein', 'Russian'),
    ('Idan Carmel', 'Russian'),
    ('Yair Ben-Ami', 'Night Ops'),
    ('Shai Klein', 'Krav Maga Inst.'),
    ('Lior Friedman', 'Night Ops'),
    ('Ben Naveh', 'Heavy Truck'),
    ('Gal Adler', 'Comms Tech'),
    ('Rotem Avidan', 'Mechanic')
  );

-- One slot demands senior medic, another senior sniper.
update slot_skills ss set min_level = 'senior'
from slots sl, skills sk
where ss.slot_id = sl.id and ss.skill_id = sk.id
  and sl.title = 'Northern QRF — Sector 4' and sk.name = 'Night Ops';

-- Seed activity feed
insert into activity_log (unit_id, actor_name, verb, what, tone, created_at)
select id, actor, verb, what, tone, now() - (mins || ' minutes')::interval
from units, (values
  ('You', 'posted an urgent call-up', 'Northern QRF, 6 needed', 'urgent', 12),
  ('Tamar Levi', 'set status to', 'Standby (through Fri)', 'accent', 32),
  ('Eitan Cohen', 'updated phone number', null, null, 60),
  ('Daniel Katz', 'assigned', 'Avi Mizrahi to Outpost Rotation', 'accent', 120),
  ('Noa Shapira', 'set status to', 'Released', null, 240),
  ('Maya Ben-David', 'set status to', 'Unavailable (abroad)', null, 1440),
  ('Hadar Stern', 'joined the unit', null, 'accent', 4320)
) as a(actor, verb, what, tone, mins);
