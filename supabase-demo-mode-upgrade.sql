-- Demo Mode upgrade (2026-09-30)
-- 1. dr_demo_visitors gets a `name` column (was phone-only) — demo.html/js/demo.js now
--    capture name+phone and Telegram-notify the admin, see companion JS changes.
-- 2. Existing demo org (d3d3d3d3-1111-2222-3333-444455556666, "Demo Sangh (Sample)")
--    had all 23 general_heads / 73 swapna heads seeded with paryushan_day = NULL, so
--    NONE of them ever showed up in Donation Entry's day-wise view (loadDay1HeadsEntry()
--    filters by paryushan_day). This backfills a realistic day spread.
-- 3. Demo org only had 1 sample member + 1 pending donation — far too sparse for a
--    trustee evaluating the app to get a real feel for Reports/Members/Category Summary.
--    This adds 9 more families and ~24 more donations across the real head structure
--    already seeded (general + the 14-swapna tree), with a realistic paid/pending mix
--    and receipt numbers assigned for paid entries so the Receipt button works without
--    needing a write (writes are blocked client-side in demo mode).

begin;

-- ---------- 1. schema ----------
alter table dr_demo_visitors add column if not exists name text;

-- dr_demo_visitors previously only granted INSERT to `authenticated` — but demo.js
-- runs with NO login (anon key, no auth session), so every real visitor's insert was
-- silently failing RLS/grant checks this whole time. Found via smoke test 2026-09-30.
grant insert on dr_demo_visitors to anon;

-- ---------- 2a. paryushan_day backfill: general heads ----------
with top as (
  select id, row_number() over (order by name) as rn
  from dr_general_heads
  where org_id = 'd3d3d3d3-1111-2222-3333-444455556666' and parent_id is null
)
update dr_general_heads g
set paryushan_day = (array[1,3,5,7,8])[((t.rn - 1) % 5) + 1]
from top t
where g.id = t.id;

update dr_general_heads c
set paryushan_day = p.paryushan_day
from dr_general_heads p
where c.org_id = 'd3d3d3d3-1111-2222-3333-444455556666'
  and c.parent_id = p.id
  and c.paryushan_day is null;

-- ---------- 2b. paryushan_day backfill: swapna (3 levels deep) ----------
with top as (
  select id, row_number() over (order by name) as rn
  from dr_swapna
  where org_id = 'd3d3d3d3-1111-2222-3333-444455556666' and parent_id is null
)
update dr_swapna g
set paryushan_day = (array[1,3,5,7,8])[((t.rn - 1) % 5) + 1]
from top t
where g.id = t.id;

update dr_swapna c
set paryushan_day = p.paryushan_day
from dr_swapna p
where c.org_id = 'd3d3d3d3-1111-2222-3333-444455556666'
  and c.parent_id = p.id
  and c.paryushan_day is null;

update dr_swapna c
set paryushan_day = p.paryushan_day
from dr_swapna p
where c.org_id = 'd3d3d3d3-1111-2222-3333-444455556666'
  and c.parent_id = p.id
  and c.paryushan_day is null;

-- ---------- 3a. seed families ----------
insert into dr_members (org_id, family_no, person_name, phone_no, address, family_member_count, is_head)
values
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-2','Rasiklal N. Shah','9825011111','Harinagar, Vadodara',2,true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-3','Kantilal M. Mehta','9725022222','Karelibaug, Vadodara',4,true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-4','Nileshbhai C. Shah','9925033333','Manjalpur, Vadodara',3,true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-5','Bharatbhai J. Doshi','9016044444','Sayajigunj, Vadodara',1,true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-6','Ashwinbhai R. Gandhi','9879055555','Alkapuri, Vadodara',5,true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-7','Pankajbhai V. Sanghvi','9712066666','Gotri, Vadodara',2,true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-8','Mahendrabhai C. Kothari','9638077777','Waghodia Road, Vadodara',3,true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-9','Dipakbhai R. Vora','9904088888','Harinagar, Vadodara',4,true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-10','Sureshbhai A. Parekh','9898099999','Karelibaug, Vadodara',2,true)
on conflict do nothing;

insert into dr_family_individuals (org_id, family_no, person_name, phone, is_head)
values
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-2','Rasiklal N. Shah','9825011111',true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-2','Kokilaben R. Shah',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-3','Kantilal M. Mehta','9725022222',true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-3','Hansaben K. Mehta',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-3','Nirav K. Mehta',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-4','Nileshbhai C. Shah','9925033333',true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-4','Falguniben N. Shah',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-5','Bharatbhai J. Doshi','9016044444',true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-6','Ashwinbhai R. Gandhi','9879055555',true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-6','Rekhaben A. Gandhi',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-7','Pankajbhai V. Sanghvi','9712066666',true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-8','Mahendrabhai C. Kothari','9638077777',true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-8','Varshaben M. Kothari',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-9','Dipakbhai R. Vora','9904088888',true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-10','Sureshbhai A. Parekh','9898099999',true)
on conflict do nothing;

-- ---------- 3b. seed donations ----------
-- this org's single "Default Event" id: 0f90e3e5-8fee-4042-a41e-8078f93a7eb3
create temporary table tmp_demo_rows (
  head_type text, general_head_name text, swapna_name text, swapna_item_name text,
  family_no text, donor_name text, phone text, amount numeric,
  paid boolean, payment_mode text, payment_ref text, days_ago int
);

insert into tmp_demo_rows values
  ('general_head','સભ્ય અનુદાન',null,null,'DEMO-2','Rasiklal N. Shah','9825011111',1100,true,'cash',null,4),
  ('general_head','દેરાસર નિભાવણી ફંડ',null,null,'DEMO-3','Kantilal M. Mehta','9725022222',2100,true,'online','UPI-DEMO-1042',4),
  ('general_head','પાઠશાળા ખાતે',null,null,'DEMO-4','Nileshbhai C. Shah','9925033333',501,false,null,null,3),
  ('general_head','સ્વામીવાત્સલ્ય ફંડ',null,null,'DEMO-5','Bharatbhai J. Doshi','9016044444',5100,true,'online','CHQ-000456',3),
  ('general_head','સાધર્મિક ભક્તિ ખાતે',null,null,'DEMO-6','Ashwinbhai R. Gandhi','9879055555',1500,true,'cash',null,2),
  ('general_head','જ્ઞાન',null,null,'DEMO-7','Pankajbhai V. Sanghvi','9712066666',2500,true,'online','UPI-DEMO-1043',2),
  ('general_head','દેવદ્રવ્ય',null,null,'DEMO-8','Mahendrabhai C. Kothari','9638077777',11000,true,'cash',null,1),
  ('general_head','જીવદયા',null,null,'DEMO-9','Dipakbhai R. Vora','9904088888',750,false,null,null,1),
  ('general_head','વૈયાવચ',null,null,'DEMO-10','Sureshbhai A. Parekh','9898099999',1100,true,'cash',null,1),
  ('general_head','આંગી',null,null,null,'Kiranbhai Trivedi','9099011121',501,true,'cash',null,5),
  ('general_head','દર્પણ',null,null,null,'Ritaben Joshi','9099022232',251,false,null,null,4),
  ('swapna_item',null,'૧ લું સ્વપ્ન - હાથી','સોનાની માળાનો ચઢાવો','DEMO-2','Rasiklal N. Shah','9825011111',15100,true,'cash',null,6),
  ('swapna_item',null,'૧૦ મું સ્વપ્ન - પદ્મ સરોવર','ફૂલની માળાનો ચઢાવો','DEMO-3','Kantilal M. Mehta','9725022222',3100,true,'online','UPI-DEMO-1044',6),
  ('swapna_item',null,'૧૧ મું સ્વપ્ન - ક્ષીર સમુદ્ર','ઝૂલાવવાનો ચઢાવો','DEMO-4','Nileshbhai C. Shah','9925033333',2100,false,null,null,5),
  ('swapna_item',null,'૧૨ મું સ્વપ્ન - દેવ વિમાન','સોનાની માળાનો ચઢાવો','DEMO-6','Ashwinbhai R. Gandhi','9879055555',21000,true,'online','CHQ-000457',5),
  ('swapna_item',null,'૧૩ મું સ્વપ્ન - રત્નનો ઢગલો','ફૂલની માળાનો ચઢાવો','DEMO-7','Pankajbhai V. Sanghvi','9712066666',5100,true,'cash',null,4),
  ('swapna','ચૌદ સ્વપ્ન ના ચઢાવા',null,null,'DEMO-8','Mahendrabhai C. Kothari','9638077777',51000,true,'online','UPI-DEMO-1045',3),
  ('swapna','ગુરુ પૂજન',null,null,'DEMO-9','Dipakbhai R. Vora','9904088888',1100,true,'cash',null,3),
  ('swapna','કલ્પ સૂત્ર વહોરાવવાનો ચઢાવો',null,null,'DEMO-10','Sureshbhai A. Parekh','9898099999',7100,true,'online','CHQ-000458',2),
  ('swapna','જ્ઞાનની પાંચ પૂજાના ચઢાવા',null,null,'DEMO-2','Rasiklal N. Shah','9825011111',2100,false,null,null,2),
  ('swapna','સાતમો દિવસ - વરઘોડા ના ચઢાવા',null,null,'DEMO-5','Bharatbhai J. Doshi','9016044444',3100,true,'cash',null,1),
  ('swapna','સાતમો દિવસ - સવારના વ્યાખ્યાનમાં બોલીના ચઢાવા',null,null,'DEMO-3','Kantilal M. Mehta','9725022222',1500,true,'online','UPI-DEMO-1046',1),
  ('swapna','આઠમો દિવસ - સંવત્સરી પ્રતિક્રમણ શરૂ થતાં પહેલા સૂત્રોની બોલીના ચઢાવા',null,null,'DEMO-9','Dipakbhai R. Vora','9904088888',2500,true,'cash',null,0),
  ('swapna','શ્રી મહાવીર સ્વામી પ્રભુનું પારણું ઘરે લઈ જવાનો ચઢાવો',null,null,'DEMO-4','Nileshbhai C. Shah','9925033333',15100,true,'cash',null,0);

insert into dr_donations
  (org_id, event_id, head_type, general_head_id, swapna_id, swapna_item_id,
   member_id, donor_name, family_no, phone, amount, received_amount,
   payment_mode, payment_ref, created_at)
select
  'd3d3d3d3-1111-2222-3333-444455556666',
  '0f90e3e5-8fee-4042-a41e-8078f93a7eb3',
  r.head_type,
  case when r.head_type = 'general_head' then
    (select id from dr_general_heads where org_id='d3d3d3d3-1111-2222-3333-444455556666' and name = r.general_head_name limit 1)
  end,
  case when r.head_type = 'swapna' then
    (select id from dr_swapna where org_id='d3d3d3d3-1111-2222-3333-444455556666' and name = r.swapna_name limit 1)
  end,
  case when r.head_type = 'swapna_item' then
    (select si.id from dr_swapna_items si join dr_swapna s on s.id = si.swapna_id
     where s.org_id='d3d3d3d3-1111-2222-3333-444455556666' and s.name = r.swapna_name and si.name = r.swapna_item_name limit 1)
  end,
  m.id, r.donor_name, r.family_no, r.phone, r.amount,
  case when r.paid then r.amount else null end,
  case when r.paid then r.payment_mode else null end,
  case when r.paid then r.payment_ref else null end,
  now() - (r.days_ago || ' days')::interval
from tmp_demo_rows r
left join dr_members m on m.org_id = 'd3d3d3d3-1111-2222-3333-444455556666' and m.family_no = r.family_no;

drop table tmp_demo_rows;

-- ---------- 3c. assign receipt numbers to the paid seed rows ----------
with paid as (
  select id, row_number() over (order by created_at) as rn
  from dr_donations
  where org_id = 'd3d3d3d3-1111-2222-3333-444455556666'
    and received_amount is not null
    and receipt_no is null
)
update dr_donations d
set receipt_no = p.rn, receipt_no_assigned_at = now()
from paid p
where d.id = p.id;

insert into dr_receipt_counters (org_id, next_no)
select 'd3d3d3d3-1111-2222-3333-444455556666',
       coalesce((select max(receipt_no) from dr_donations where org_id='d3d3d3d3-1111-2222-3333-444455556666'), 0) + 1
on conflict (org_id) do update set next_no = excluded.next_no;

commit;
