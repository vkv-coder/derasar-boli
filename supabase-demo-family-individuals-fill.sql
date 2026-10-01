-- Fill in missing dr_family_individuals rows for the demo org (2026-10-01)
-- Several seeded families had fewer individuals on file than their
-- family_member_count (some had only the head), so "Receipt In Name Of"
-- in Donation Entry showed just one name (or none at all for DEMO-1,
-- which had zero rows) instead of demonstrating the multi-person picker.
-- DEMO-1 and DEMO-5 stay genuinely single-member — realistic, not a gap.

insert into dr_family_individuals (org_id, family_no, person_name, phone, is_head)
values
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-1','Sample Member','9999999999',true),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-3','Priya K. Mehta',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-4','Devansh N. Shah',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-6','Mitul A. Gandhi',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-6','Sejal A. Gandhi',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-6','Kavya A. Gandhi',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-7','Nita P. Sanghvi',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-8','Ronak M. Kothari',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-9','Minal D. Vora',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-9','Aryan D. Vora',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-9','Khushi D. Vora',null,false),
  ('d3d3d3d3-1111-2222-3333-444455556666','DEMO-10','Jyotsna S. Parekh',null,false)
on conflict do nothing;
