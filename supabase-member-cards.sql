-- Supports the Membership Card feature and future full-roster imports
-- (multiple dr_members rows sharing one family_no, same pattern the
-- original 292 pre-existing members already use). is_head marks which
-- row's name gets bolded on the card and is used as the "family head"
-- for display purposes (e.g. the family-outstanding QR deep-link view).
alter table dr_members add column if not exists is_head boolean default false;

-- Current 156 members (2026-08 Google Form import) are each their family's
-- only row so far — mark them all as head until a fuller roster is imported.
update dr_members set is_head = true
where org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
