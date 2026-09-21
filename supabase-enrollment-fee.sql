-- New Member / Enrollment Fee: a genuinely one-time charge per family (paid
-- once ever, unlike Membership Fee which is per-year) for a new member
-- joining. Same receipt-number sequence, manual-override, and remarks
-- pattern as Membership Fee for consistency.

create table if not exists dr_enrollment_fees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references dr_organizations(id),
  family_no text not null,
  amount numeric not null,
  payment_mode text default 'cash',
  payment_ref text,
  remarks text,
  receipt_no integer,
  receipt_no_assigned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, family_no)
);

alter table dr_enrollment_fees enable row level security;

create policy "Admin manages enrollment fees" on dr_enrollment_fees
  for all using (dr_is_admin_of(org_id)) with check (dr_is_admin_of(org_id));

-- Same atomic assign-once-reuse-after pattern as the other
-- dr_assign_receipt_no_* functions.
create or replace function dr_assign_receipt_no_enrollment_fee(p_id uuid)
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
  select org_id, receipt_no into v_org, v_existing from dr_enrollment_fees where id = p_id;
  if v_org is null then return null; end if;
  if v_existing is not null then return v_existing; end if;
  v_no := dr_next_receipt_no(v_org);
  update dr_enrollment_fees set receipt_no = v_no, receipt_no_assigned_at = now() where id = p_id;
  return v_no;
end;
$$;

revoke all on function dr_assign_receipt_no_enrollment_fee(uuid) from public;
grant execute on function dr_assign_receipt_no_enrollment_fee(uuid) to anon, authenticated;
