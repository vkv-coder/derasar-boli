-- Fixes a cross-tenant privilege-escalation hole: dr_current_org_id() and
-- dr_is_admin_of() never checked dr_profiles.status, so a self-inserted
-- profile (role/org_id are fully client-controlled at signup — see
-- signup.js, which legitimately sets role='admin' for a NEW org's
-- founder) with status='pending' was already trusted everywhere, for ANY
-- org_id, including an already-approved one belonging to someone else.
-- Every dr_* table's RLS ultimately calls one of these two functions, so
-- this single change closes the hole for all of them at once, without
-- touching the signup flow or any RLS policy.
--
-- Safe for the existing approval flow: handle_org_approval() flips
-- dr_profiles.status to 'approved' the moment its org's status becomes
-- 'approved', which is the only place status ever changes — so a
-- legitimately approved admin is unaffected, they just weren't supposed
-- to have access before that point either.

create or replace function public.dr_current_org_id()
returns uuid
language sql
stable security definer
as $$
  select org_id from dr_profiles where id = auth.uid() and status = 'approved';
$$;

create or replace function public.dr_is_admin_of(p_org_id uuid)
returns boolean
language sql
stable security definer
as $$
  select exists(
    select 1 from dr_profiles
    where id = auth.uid() and role = 'admin' and org_id = p_org_id and status = 'approved'
  );
$$;
