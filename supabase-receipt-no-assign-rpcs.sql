-- Wraps dr_next_receipt_no() with per-table "assign if not already assigned"
-- RPCs, done atomically server-side (SECURITY DEFINER) so: (1) two rapid
-- clicks on the same receipt can't ever get two different numbers, and
-- (2) the receipt_no write doesn't depend on the caller having UPDATE
-- rights on the underlying table (dr_donations/dr_receipt_tokens UPDATE is
-- admin-only via RLS; receipt printing shouldn't require that).

create or replace function dr_assign_receipt_no_donation(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_existing integer;
  v_no integer;
begin
  select org_id, receipt_no into v_org, v_existing from dr_donations where id = p_id;
  if v_org is null then return null; end if;
  if v_existing is not null then return v_existing; end if;
  v_no := dr_next_receipt_no(v_org);
  update dr_donations set receipt_no = v_no where id = p_id;
  return v_no;
end;
$$;

create or replace function dr_assign_receipt_no_token(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_existing integer;
  v_no integer;
begin
  select org_id, receipt_no into v_org, v_existing from dr_receipt_tokens where id = p_id;
  if v_org is null then return null; end if;
  if v_existing is not null then return v_existing; end if;
  v_no := dr_next_receipt_no(v_org);
  update dr_receipt_tokens set receipt_no = v_no where id = p_id;
  return v_no;
end;
$$;

create or replace function dr_assign_receipt_no_split(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_existing integer;
  v_no integer;
begin
  select org_id, receipt_no into v_org, v_existing from dr_token_splits where id = p_id;
  if v_org is null then return null; end if;
  if v_existing is not null then return v_existing; end if;
  v_no := dr_next_receipt_no(v_org);
  update dr_token_splits set receipt_no = v_no where id = p_id;
  return v_no;
end;
$$;

revoke all on function dr_assign_receipt_no_donation(uuid) from public;
revoke all on function dr_assign_receipt_no_token(uuid) from public;
revoke all on function dr_assign_receipt_no_split(uuid) from public;
grant execute on function dr_assign_receipt_no_donation(uuid) to anon, authenticated;
grant execute on function dr_assign_receipt_no_token(uuid) to anon, authenticated;
grant execute on function dr_assign_receipt_no_split(uuid) to anon, authenticated;
