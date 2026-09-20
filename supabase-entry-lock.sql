-- Entry Lock: freezes past donations/tokens/splits against correction once
-- an admin "closes" them via a movable lock date, with one flagged profile
-- exempt for the rare real correction still needed. Enforced two ways:
-- (1) client-side in js/lock.js for a clear message, and (2) for real here
-- via RESTRICTIVE policies (combine with AND alongside every existing
-- PERMISSIVE policy, so this is purely additive — no existing policy is
-- touched or needs to be rewritten) plus a trigger guarding who can move
-- the lock date itself.

alter table dr_organizations add column if not exists locked_through_date date;
alter table dr_profiles add column if not exists can_override_lock boolean not null default false;

-- ---------- Server-side lock check, reused by all three tables ----------
create or replace function dr_entry_editable(p_org_id uuid, p_entry_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_through date;
  v_can_override boolean;
begin
  select locked_through_date into v_locked_through from dr_organizations where id = p_org_id;
  if v_locked_through is null or p_entry_date > v_locked_through then
    return true;
  end if;
  select can_override_lock into v_can_override from dr_profiles where id = auth.uid();
  return coalesce(v_can_override, false);
end;
$$;

revoke all on function dr_entry_editable(uuid, date) from public;
grant execute on function dr_entry_editable(uuid, date) to anon, authenticated;

-- ---------- Restrictive policies: block UPDATE/DELETE on locked rows ----------
-- INSERT is deliberately untouched — new entries are never locked, only
-- corrections to existing ones dated on/before the lock date.
create policy "dr_donations_lock_update" on dr_donations as restrictive for update
  using (dr_entry_editable(org_id, created_at::date));
create policy "dr_donations_lock_delete" on dr_donations as restrictive for delete
  using (dr_entry_editable(org_id, created_at::date));

create policy "dr_token_splits_lock_update" on dr_token_splits as restrictive for update
  using (dr_entry_editable(org_id, created_at::date));
create policy "dr_token_splits_lock_delete" on dr_token_splits as restrictive for delete
  using (dr_entry_editable(org_id, created_at::date));

create policy "dr_receipt_tokens_lock_update" on dr_receipt_tokens as restrictive for update
  using (dr_entry_editable(org_id, created_at::date));

-- ---------- Guard who can move the lock date itself ----------
-- Only a RESTRICTIVE policy can't easily express "this one column changed"
-- (RLS is per-row, not per-column) — a trigger sees OLD/NEW directly, so it's
-- the right tool here, same reasoning as postgres_rls_gotchas #2's fix.
create or replace function dr_guard_lock_date_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can_override boolean;
begin
  if NEW.locked_through_date is distinct from OLD.locked_through_date then
    select can_override_lock into v_can_override from dr_profiles where id = auth.uid();
    if not coalesce(v_can_override, false) then
      raise exception 'Only an authorized admin can change the entry lock date';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists dr_organizations_lock_guard on dr_organizations;
create trigger dr_organizations_lock_guard
before update on dr_organizations
for each row execute function dr_guard_lock_date_change();

-- ---------- One-time: flag yourself (or whoever should hold override) ----------
-- Uncomment and fill in the real email, then run separately:
-- update dr_profiles set can_override_lock = true
--   where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
