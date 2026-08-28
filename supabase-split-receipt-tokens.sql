-- Split-Name Receipts for Large Boli Donations
-- Adds: per-org split threshold, dr_receipt_tokens (pending "payment offer accepted" slips),
-- dr_donations.split_token_id link, and RLS on the new table mirroring dr_donations.

alter table dr_organizations
  add column if not exists split_receipt_threshold numeric default 20000;

create table if not exists dr_receipt_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references dr_organizations(id),
  event_id uuid references dr_events(id),
  head_type text not null check (head_type in ('swapna','swapna_item','general_head')),
  swapna_id uuid references dr_swapna(id),
  swapna_item_id uuid references dr_swapna_items(id),
  general_head_id uuid references dr_general_heads(id),
  member_id uuid references dr_members(id),
  payer_name text not null,
  phone text,
  family_no text,
  total_amount numeric not null,
  mun_qty numeric,
  rate_per_mun_used numeric,
  status text not null default 'pending' check (status in ('pending','allocated','cancelled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  allocated_by uuid,
  allocated_at timestamptz
);

alter table dr_donations
  add column if not exists split_token_id uuid references dr_receipt_tokens(id);

-- Set on every dr_donations row produced by the split feature (both the immediate
-- "Split Now" path and token allocation) so receipts can suppress the family number
-- regardless of whether a token was involved.
alter table dr_donations
  add column if not exists is_split_row boolean not null default false;

alter table dr_receipt_tokens enable row level security;

create policy "Own org can add tokens" on dr_receipt_tokens
  for insert with check (org_id = dr_current_org_id());

create policy "Own org can view tokens" on dr_receipt_tokens
  for select using (org_id = dr_current_org_id());

create policy "Own org admin can manage tokens" on dr_receipt_tokens
  for all using (dr_is_admin_of(org_id)) with check (dr_is_admin_of(org_id));
