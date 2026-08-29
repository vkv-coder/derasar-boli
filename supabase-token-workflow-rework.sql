-- Token-Based Collection Workflow + Head Classification
-- Part 1: category / pricing_type / aani unit on heads + org
-- Part 2: token workflow rework (multi-line tokens, paid status, dr_token_splits)

-- ===== Part 1 =====

alter table dr_organizations add column if not exists rate_per_aani numeric default 1800;

alter table dr_general_heads add column if not exists category text;
alter table dr_general_heads add column if not exists pricing_type text check (pricing_type in ('fixed','auction')) default 'fixed';

alter table dr_swapna add column if not exists category text;
alter table dr_swapna add column if not exists pricing_type text check (pricing_type in ('fixed','auction')) default 'auction';

alter table dr_swapna_items add column if not exists category text;
alter table dr_swapna_items add column if not exists pricing_type text check (pricing_type in ('fixed','auction')) default 'auction';

alter table dr_donations add column if not exists aani_qty numeric;
alter table dr_donations add column if not exists rate_per_aani_used numeric;

-- ===== Part 2 =====

alter table dr_donations rename column split_token_id to token_id;
alter table dr_donations drop column if exists is_split_row;

-- Backfill: any still-pending token from the old single-head design becomes a real
-- dr_donations line (unpaid) before we drop the head columns off dr_receipt_tokens.
insert into dr_donations (org_id, event_id, head_type, general_head_id, swapna_id, swapna_item_id,
  member_id, donor_name, family_no, phone, amount, mun_qty, rate_per_mun_used, token_id, entered_by)
select org_id, event_id, head_type, general_head_id, swapna_id, swapna_item_id,
  member_id, payer_name, family_no, phone, total_amount, mun_qty, rate_per_mun_used, id, created_by
from dr_receipt_tokens
where status = 'pending';

alter table dr_receipt_tokens drop constraint if exists dr_receipt_tokens_general_head_id_fkey;
alter table dr_receipt_tokens drop constraint if exists dr_receipt_tokens_swapna_id_fkey;
alter table dr_receipt_tokens drop constraint if exists dr_receipt_tokens_swapna_item_id_fkey;
alter table dr_receipt_tokens drop constraint if exists dr_receipt_tokens_head_type_check;
alter table dr_receipt_tokens drop column if exists head_type;
alter table dr_receipt_tokens drop column if exists swapna_id;
alter table dr_receipt_tokens drop column if exists swapna_item_id;
alter table dr_receipt_tokens drop column if exists general_head_id;

alter table dr_receipt_tokens drop constraint if exists dr_receipt_tokens_status_check;
alter table dr_receipt_tokens add constraint dr_receipt_tokens_status_check
  check (status in ('pending','paid','paid_awaiting_split','allocated','cancelled'));
alter table dr_receipt_tokens add column if not exists paid_at timestamptz;

create table if not exists dr_token_splits (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references dr_receipt_tokens(id),
  org_id uuid not null references dr_organizations(id),
  name text not null,
  amount numeric not null,
  member_id uuid references dr_members(id),
  family_no text,
  created_at timestamptz not null default now()
);

alter table dr_token_splits enable row level security;

create policy "Own org can add token splits" on dr_token_splits
  for insert with check (org_id = dr_current_org_id());

create policy "Own org can view token splits" on dr_token_splits
  for select using (org_id = dr_current_org_id());

create policy "Own org admin can manage token splits" on dr_token_splits
  for all using (dr_is_admin_of(org_id)) with check (dr_is_admin_of(org_id));
