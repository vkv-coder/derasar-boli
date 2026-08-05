-- Adds Rupees / Mun / Part-Rupees-Part-Mun support to auction (swapna) boli.
-- Boli in some temples is spoken in "mun" (weight unit), not Rupees, and the
-- Rupee value per mun differs by temple.
--
-- Master switch lives on dr_organizations (one temple = one system, per user):
--   'rupees' — everything is Rupees, exactly as today. No rate anywhere.
--   'mun'    — everything is Mun. ONE shared rate (dr_organizations.rate_per_mun)
--              applies to every head; entry shows both Mun qty and its Rupee equivalent.
--   'mixed'  — "Part Rupees Part Mun": admin picks Rupees-or-Mun PER HEAD in
--              Heads Setup (master), only enabled when this is the org's mode.
--              Each head set to Mun gets its own rate (dr_swapna.rate_per_mun /
--              dr_swapna_items.rate_per_mun), since even within one temple
--              different auction items can be valued differently.
--
-- dr_donations.amount always stores the final ₹ value (so every existing
-- report/receipt/live-view sum keeps working unchanged); mun_qty +
-- rate_per_mun_used are snapshotted at entry time so a later rate change
-- never rewrites historical entries.

alter table dr_organizations
  add column if not exists boli_unit_mode text not null default 'rupees'
    check (boli_unit_mode in ('rupees','mun','mixed')),
  add column if not exists rate_per_mun numeric;

alter table dr_swapna
  add column if not exists unit_mode text not null default 'rupees'
    check (unit_mode in ('rupees','mun')),
  add column if not exists rate_per_mun numeric;

alter table dr_swapna_items
  add column if not exists unit_mode text not null default 'rupees'
    check (unit_mode in ('rupees','mun')),
  add column if not exists rate_per_mun numeric;

alter table dr_donations
  add column if not exists mun_qty numeric,
  add column if not exists rate_per_mun_used numeric;

-- dr_organizations had SELECT/INSERT policies only — no UPDATE at all, so an
-- admin could never save boli_unit_mode/rate_per_mun (or namah_text, org name,
-- etc.) through the app. Scoped the same way as every other dr_* admin policy.
drop policy if exists "Own org admin can update organization" on dr_organizations;
create policy "Own org admin can update organization"
  on dr_organizations for update
  using (dr_is_admin_of(id))
  with check (dr_is_admin_of(id));
