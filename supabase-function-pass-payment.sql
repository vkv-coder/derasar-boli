-- Extends Function/Event Passes with Free/Paid support. A function can now
-- be marked paid with a per-person token amount (e.g. Swamivatsalya) or
-- left free (e.g. Nisal Garva) - free events keep working exactly as
-- before (just a headcount). Paid ones get a real receipt (same shared
-- receipt_no sequence as donations/tokens/membership fees) computed as
-- amount_per_person × the family's person count, stored on the pass row
-- itself (not recomputed live) so it stays historically accurate even if
-- the event's price is edited later.

alter table dr_functions add column if not exists is_free boolean not null default true;
alter table dr_functions add column if not exists amount_per_person numeric;

alter table dr_function_passes add column if not exists total_amount numeric;
alter table dr_function_passes add column if not exists payment_mode text default 'cash';
alter table dr_function_passes add column if not exists payment_ref text;
alter table dr_function_passes add column if not exists receipt_no integer;
alter table dr_function_passes add column if not exists receipt_no_assigned_at timestamptz;

-- Same atomic assign-once-reuse-after pattern as
-- dr_assign_receipt_no_donation/_token/_split/_membership_fee.
create or replace function dr_assign_receipt_no_function_pass(p_id uuid)
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
  select org_id, receipt_no into v_org, v_existing from dr_function_passes where id = p_id;
  if v_org is null then return null; end if;
  if v_existing is not null then return v_existing; end if;
  v_no := dr_next_receipt_no(v_org);
  update dr_function_passes set receipt_no = v_no, receipt_no_assigned_at = now() where id = p_id;
  return v_no;
end;
$$;

revoke all on function dr_assign_receipt_no_function_pass(uuid) from public;
grant execute on function dr_assign_receipt_no_function_pass(uuid) to anon, authenticated;
