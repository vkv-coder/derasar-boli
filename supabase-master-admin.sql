-- Adds a "master_admin" tier above "admin":
--   master_admin: everything an admin can do, PLUS can add/remove other
--     admins. Exactly one per org (the org's founder, or whoever is
--     promoted below for orgs that predate this feature).
--   admin: unchanged full access to donations/reports/heads/etc, but can
--     only add/remove operators now, not other admins.
--   operator: unchanged (Donation Entry only).
--
-- dr_is_admin_of() is updated to treat master_admin as admin-equivalent so
-- every existing RLS policy built on it keeps working for master admins
-- with zero other changes. A separate, narrower check (done in the
-- create-user/delete-user edge functions, not in RLS, since those already
-- own all profile/user-management logic) gates the new admin-managing-admin
-- rule.

alter table dr_profiles drop constraint profiles_role_check;
alter table dr_profiles add constraint profiles_role_check
  check (role = any (array['master_admin', 'admin', 'operator']));

create or replace function public.dr_is_admin_of(p_org_id uuid)
returns boolean
language sql
stable security definer
as $$
  select exists(
    select 1 from dr_profiles
    where id = auth.uid() and role in ('admin', 'master_admin')
      and org_id = p_org_id and status = 'approved'
  );
$$;

-- One-time promotion for the 3 orgs that predate this feature: the
-- earliest-created admin in each becomes that org's master_admin. Chosen
-- explicitly per org (not "earliest admin, automatically, forever") so a
-- future org with a stray early test account can't accidentally inherit
-- master_admin by date alone.
update dr_profiles set role = 'master_admin'
  where id = 'e50fbab2-23a5-49e0-88df-9a45bd4447ad'; -- S K Shah Gotri Sangh — unigoods2026@gmail.com
update dr_profiles set role = 'master_admin'
  where id = '45b6bef4-76c4-441b-8f5f-77428654a2d0'; -- Arihantdham Swe Mu Tapa Jain Assoc
update dr_profiles set role = 'master_admin'
  where id = '62f4c66b-f677-42b6-a344-66d2c7157755'; -- Shree Sambhavnath Jain Derasar
