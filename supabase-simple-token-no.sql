-- Simple sequential token numbers (1, 2, 3...) instead of the derived
-- TKN-2026-XXXXXX code — easy to type and search at the payment counter.
-- Assigned automatically via a BEFORE INSERT trigger so it works no matter
-- which code path creates the token (fresh cart, or the retroactive
-- "bundle already-saved donations" flow).

create table if not exists dr_token_counters (
  org_id uuid primary key references dr_organizations(id),
  next_no integer not null default 1
);

alter table dr_token_counters enable row level security;

create policy "Own org can view token counter" on dr_token_counters
  for select using (org_id = dr_current_org_id());

create or replace function dr_next_token_no(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned integer;
begin
  insert into dr_token_counters (org_id, next_no) values (p_org_id, 1)
  on conflict (org_id) do nothing;

  update dr_token_counters
  set next_no = next_no + 1
  where org_id = p_org_id
  returning next_no - 1 into v_assigned;

  return v_assigned;
end;
$$;

revoke all on function dr_next_token_no(uuid) from public;
grant execute on function dr_next_token_no(uuid) to anon, authenticated;

alter table dr_receipt_tokens add column if not exists token_no integer;

create or replace function dr_assign_token_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.token_no is null then
    new.token_no := dr_next_token_no(new.org_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_token_no on dr_receipt_tokens;
create trigger trg_assign_token_no
before insert on dr_receipt_tokens
for each row execute function dr_assign_token_no();
