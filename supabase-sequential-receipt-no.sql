-- Real sequential receipt numbers, replacing the ad-hoc ID-derived ones.
-- Prefix is left blank for now (org-configurable, to be set later) —
-- the serial number itself is what matters for now.

alter table dr_organizations add column if not exists receipt_prefix text default '';

create table if not exists dr_receipt_counters (
  org_id uuid primary key references dr_organizations(id),
  next_no integer not null default 1
);

alter table dr_receipt_counters enable row level security;

create policy "Own org can view receipt counter" on dr_receipt_counters
  for select using (org_id = dr_current_org_id());

-- Atomic increment-and-return so two admins printing at the same moment
-- never get the same number — a single UPDATE...RETURNING is safe under
-- concurrency, unlike a client-side read-then-write.
create or replace function dr_next_receipt_no(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned integer;
begin
  insert into dr_receipt_counters (org_id, next_no) values (p_org_id, 1)
  on conflict (org_id) do nothing;

  update dr_receipt_counters
  set next_no = next_no + 1
  where org_id = p_org_id
  returning next_no - 1 into v_assigned;

  return v_assigned;
end;
$$;

revoke all on function dr_next_receipt_no(uuid) from public;
grant execute on function dr_next_receipt_no(uuid) to anon, authenticated;

alter table dr_receipt_tokens add column if not exists receipt_no integer;
alter table dr_token_splits add column if not exists receipt_no integer;
alter table dr_donations add column if not exists receipt_no integer;
