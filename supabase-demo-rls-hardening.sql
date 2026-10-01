-- RLS hardening around the new no-approval demo mode (2026-10-01)
-- Already applied directly against the live database. Committed here as a record.
--
-- Prompted by: "does the demo give anon access to other Sangh data?" — audited
-- every dr_* table's anon grants + policies (see commit message) and found one
-- pre-existing, unrelated issue plus one gap introduced by seeding the demo org.

-- ----------------------------------------------------------------------------
-- 1. PRE-EXISTING LEAK (unrelated to demo mode): "Public can read pending
--    organizations" let ANY anon visitor read EVERY pending Sangh's full
--    dr_organizations row (name, address, PAN number, receipt_prefix, etc.),
--    not just their own — scoped only by status='pending', with no match to
--    the requesting session at all. 0 pending orgs exist right now so nothing
--    was actively exposed, but the next Sangh to sign up would have been
--    world-readable (PAN included) until approved.
--
--    The policy existed to let submitSignup() (js/signup.js) read back the org
--    row immediately after INSERT — at that moment the user is authenticated
--    (auth.signUp() already ran) but has no dr_profiles row yet, so the normal
--    "Approved users can read their own organization" policy (id IN (select
--    org_id from dr_profiles where id=auth.uid())) can't match. Fix: keep the
--    same status='pending' condition (still needed for that gap) but require
--    `authenticated` instead of `anon` — signup is already authenticated by
--    that point, so this changes nothing for the real flow while closing the
--    completely-unauthenticated read.
drop policy if exists "Public can read pending organizations" on dr_organizations;
create policy "Authenticated signup can read pending orgs" on dr_organizations
  for select to authenticated
  using (status = 'pending');

-- ----------------------------------------------------------------------------
-- 2. GAP FROM DEMO SEEDING: supabase-demo-mode-upgrade.sql added 15 rows to
--    dr_family_individuals for the demo org (used by the Membership Card
--    back-side and the "Receipt In Name Of" dropdown), but no anon-readable
--    policy covered that table — unlike dr_members/dr_donations/dr_events/
--    dr_general_heads/dr_swapna/dr_swapna_items/dr_organizations, which
--    already each have a "Public can read Demo Sangh X" policy scoped to
--    d3d3d3d3-1111-2222-3333-444455556666 only. Extends the same pattern.
create policy "Public can read Demo Sangh family individuals" on dr_family_individuals
  for select to authenticated, anon
  using (org_id = 'd3d3d3d3-1111-2222-3333-444455556666'::uuid);

-- ----------------------------------------------------------------------------
-- VERIFIED LIVE (curl with the anon key, no filters) after both changes:
--   dr_organizations      -> only the Demo Sangh row
--   dr_donations          -> only org_id d3d3d3d3... (25 rows)
--   dr_members            -> only org_id d3d3d3d3... (10 rows)
--   dr_family_individuals -> only org_id d3d3d3d3... (15 rows)
--   dr_profiles           -> empty
--   dr_swapna / dr_swapna_items / dr_events / dr_general_heads -> demo org only
--   dr_receipts / dr_token_splits / dr_enrollment_fees / dr_membership_fees /
--   dr_function_passes / dr_functions / dr_receipt_tokens / dr_receipt_counters /
--   dr_token_counters -> empty (no anon policy covers them; safe default-deny,
--   just means those specific views stay blank for a demo visitor)
