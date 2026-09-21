-- Yearly Membership Fee: a dedicated record per family per year (not a
-- generic donation) so "last year paid" is an explicit, queryable fact
-- rather than something guessed from receipt dates. One row per
-- (org_id, family_no, year) — the unique constraint stops accidentally
-- recording the same year's fee twice for one family.

create table if not exists dr_membership_fees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references dr_organizations(id),
  family_no text not null,
  year integer not null,
  amount numeric not null,
  payment_mode text default 'cash',
  payment_ref text,
  receipt_no integer,
  receipt_no_assigned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, family_no, year)
);

alter table dr_membership_fees enable row level security;

create policy "Admin manages membership fees" on dr_membership_fees
  for all using (dr_is_admin_of(org_id)) with check (dr_is_admin_of(org_id));

-- Same atomic assign-once-reuse-after pattern as
-- dr_assign_receipt_no_donation/_token/_split (see supabase-receipt-no-assign-rpcs.sql)
-- — shares the SAME dr_next_receipt_no() counter, so membership fee
-- receipts sit in the same continuous number sequence as every other
-- receipt in the Register, not a separate one.
create or replace function dr_assign_receipt_no_membership_fee(p_id uuid)
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
  select org_id, receipt_no into v_org, v_existing from dr_membership_fees where id = p_id;
  if v_org is null then return null; end if;
  if v_existing is not null then return v_existing; end if;
  v_no := dr_next_receipt_no(v_org);
  update dr_membership_fees set receipt_no = v_no, receipt_no_assigned_at = now() where id = p_id;
  return v_no;
end;
$$;

revoke all on function dr_assign_receipt_no_membership_fee(uuid) from public;
grant execute on function dr_assign_receipt_no_membership_fee(uuid) to anon, authenticated;
