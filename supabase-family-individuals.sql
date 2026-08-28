-- Separates "Members list" (one row per family, head only — the real roster
-- used by Reports/Membership Card/etc.) from a new lookup used solely by the
-- "Receipt In Name Of" dropdown, which needs every individual family member.

create table if not exists dr_family_individuals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references dr_organizations(id),
  family_no text not null,
  person_name text not null,
  phone text,
  is_head boolean not null default false,
  created_at timestamptz not null default now()
);

alter table dr_family_individuals enable row level security;

create policy "Own org can add family individuals" on dr_family_individuals
  for insert with check (org_id = dr_current_org_id());

create policy "Own org can view family individuals" on dr_family_individuals
  for select using (org_id = dr_current_org_id());

create policy "Own org admin can manage family individuals" on dr_family_individuals
  for all using (dr_is_admin_of(org_id)) with check (dr_is_admin_of(org_id));
