-- Function/event entry passes. Admin creates a "function" (e.g. a
-- lunch/gift event) with a date, and can set how many of a family's
-- members are pre-registered/allowed in for it (e.g. family of 6, but
-- only 2 paid/confirmed — admin writes 2, gate checks against that).
-- Functions past their event_date are simply filtered out client-side
-- (query uses event_date >= today) — nothing deletes them, so past
-- records stay for reference.
create table if not exists dr_functions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references dr_organizations(id) on delete cascade,
  name text not null,
  event_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists dr_function_passes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references dr_organizations(id) on delete cascade,
  function_id uuid not null references dr_functions(id) on delete cascade,
  family_no text not null,
  allowed_count int not null default 0,
  updated_at timestamptz not null default now(),
  unique (function_id, family_no)
);

alter table dr_functions enable row level security;
alter table dr_function_passes enable row level security;

-- Admin-only, matching the existing pattern that operators are
-- restricted to Donation Entry only (see js/app.js buildNav()).
drop policy if exists "dr_functions admin manage" on dr_functions;
create policy "dr_functions admin manage" on dr_functions
  for all using (dr_is_admin_of(org_id)) with check (dr_is_admin_of(org_id));

drop policy if exists "dr_function_passes admin manage" on dr_function_passes;
create policy "dr_function_passes admin manage" on dr_function_passes
  for all using (dr_is_admin_of(org_id)) with check (dr_is_admin_of(org_id));
