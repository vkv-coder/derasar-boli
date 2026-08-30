-- Receipt Register: date-range audit list across every issued receipt.
-- Adds a real "when was this receipt actually printed" timestamp (distinct
-- from created_at, since a split-later token's underlying donation can be
-- entered long before its receipt is printed) and updates the existing
-- assign-receipt-no RPCs to stamp it.

alter table dr_donations add column if not exists receipt_no_assigned_at timestamptz;
alter table dr_receipt_tokens add column if not exists receipt_no_assigned_at timestamptz;
alter table dr_token_splits add column if not exists receipt_no_assigned_at timestamptz;

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
  update dr_donations set receipt_no = v_no, receipt_no_assigned_at = now() where id = p_id;
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
  update dr_receipt_tokens set receipt_no = v_no, receipt_no_assigned_at = now() where id = p_id;
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
  update dr_token_splits set receipt_no = v_no, receipt_no_assigned_at = now() where id = p_id;
  return v_no;
end;
$$;
