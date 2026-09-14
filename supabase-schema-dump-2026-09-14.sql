-- ═══════════════════════════════════════════════════════════════
-- DERASAR BOLI — Full schema dump (public.dr_* objects only)
-- Pulled directly from the live database on 2026-09-14 via SQL
-- introspection (information_schema / pg_catalog), NOT pg_dump — this
-- Supabase project (jqqnnkzozjskziaizajg, "Dhobi -digital") is SHARED
-- across several other apps in this same `public` schema (khursilo/
-- kh_*, gift-coupon/gc_*, family-cash/fc_*, mahjong-league/mj_*, etc.),
-- so a raw `supabase db dump` would have pulled ALL of those apps'
-- tables/functions/policies too. This file is deliberately scoped to
-- ONLY dr_* objects (plus the two non-prefixed helpers this app's own
-- triggers call) so it's safe to commit to this public repo.
--
-- This is a DOCUMENTATION dump for review/audit purposes, not a
-- byte-for-byte restorable migration — re-running it top to bottom on
-- an empty database should work (tables are ordered so FKs resolve),
-- but some Supabase-managed pieces (auth.users, net.http_post
-- extension, RLS default GRANTs to anon/authenticated) are assumed to
-- already exist, same as on any fresh Supabase project.
--
-- This is why it exists: this schema previously existed ONLY in the
-- Supabase dashboard, never version-controlled anywhere — found during
-- an RLS security review (2026-09-14, see
-- supabase-fix-pending-profile-privilege-escalation.sql) ahead of
-- onboarding more temples. Re-dump periodically (or after any schema
-- change made directly via the dashboard) to keep this current.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- dr_organizations — one row per temple/Sangh (the tenant)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  address text,
  status text NOT NULL DEFAULT 'approved'::text,
  created_at timestamp with time zone DEFAULT now(),
  pan_no text,
  namah text,
  namah_text text,
  boli_unit_mode text NOT NULL DEFAULT 'rupees'::text,
  rate_per_mun numeric,
  split_receipt_threshold numeric DEFAULT 20000,
  rate_per_aani numeric DEFAULT 1800,
  receipt_prefix text DEFAULT ''::text,
  CONSTRAINT organizations_pkey PRIMARY KEY (id),
  CONSTRAINT dr_organizations_boli_unit_mode_check CHECK ((boli_unit_mode = ANY (ARRAY['rupees'::text, 'mun'::text, 'mixed'::text])))
);

ALTER TABLE public.dr_organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert pending organizations" ON public.dr_organizations
  FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending');
CREATE POLICY "Public can read pending organizations" ON public.dr_organizations
  FOR SELECT TO anon, authenticated USING (status = 'pending');
CREATE POLICY "Public can read Demo Sangh organization" ON public.dr_organizations
  FOR SELECT TO anon, authenticated USING (id = 'd3d3d3d3-1111-2222-3333-444455556666'::uuid);
CREATE POLICY "Approved users can read their own organization" ON public.dr_organizations
  FOR SELECT TO authenticated USING (id IN (SELECT org_id FROM dr_profiles WHERE dr_profiles.id = auth.uid()));
CREATE POLICY "Own org admin can update organization" ON public.dr_organizations
  FOR UPDATE TO public USING (dr_is_admin_of(id)) WITH CHECK (dr_is_admin_of(id));

CREATE TRIGGER trg_org_approval AFTER UPDATE ON public.dr_organizations
  FOR EACH ROW EXECUTE FUNCTION handle_org_approval();


-- ───────────────────────────────────────────────────────────────
-- dr_profiles — one row per login, maps auth.users -> org_id + role.
-- SECURITY-CRITICAL: dr_current_org_id()/dr_is_admin_of() (bottom of
-- this file) are the trust root for EVERY other table's RLS. See
-- supabase-fix-pending-profile-privilege-escalation.sql for the
-- cross-tenant bug found and fixed here on 2026-09-14.
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  org_id uuid,
  phone text,
  status text NOT NULL DEFAULT 'approved'::text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id),
  CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'operator'::text])))
);

ALTER TABLE public.dr_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "New user can insert own pending profile" ON public.dr_profiles
  FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending' AND id = auth.uid());
CREATE POLICY "New user can read own pending profile" ON public.dr_profiles
  FOR SELECT TO anon, authenticated USING (id = auth.uid());
CREATE POLICY "New user can update own profile during signup" ON public.dr_profiles
  FOR UPDATE TO anon, authenticated USING (id = auth.uid()) WITH CHECK (status = 'pending' AND id = auth.uid());
CREATE POLICY "Users can view own profile" ON public.dr_profiles
  FOR SELECT TO public USING (auth.uid() = id);
CREATE POLICY "Org members can view own org profiles" ON public.dr_profiles
  FOR SELECT TO public USING (org_id = dr_current_org_id());

CREATE TRIGGER dr_profiles_notify_approval AFTER UPDATE ON public.dr_profiles
  FOR EACH ROW EXECUTE FUNCTION dr_notify_approval();


-- ───────────────────────────────────────────────────────────────
-- dr_events — one "occasion" (e.g. a Paryushan year) per org
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_date date,
  is_live boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  org_id uuid,
  CONSTRAINT events_pkey1 PRIMARY KEY (id),
  CONSTRAINT events_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id)
);

ALTER TABLE public.dr_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view events" ON public.dr_events
  FOR SELECT TO public USING (org_id = dr_current_org_id());
CREATE POLICY "Public can read Demo Sangh events" ON public.dr_events
  FOR SELECT TO anon, authenticated USING (org_id = 'd3d3d3d3-1111-2222-3333-444455556666'::uuid);
CREATE POLICY "Own org admin can manage events" ON public.dr_events
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));


-- ───────────────────────────────────────────────────────────────
-- dr_general_heads — one donation category tree (fixed-price)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_general_heads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid,
  name text NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  parent_id uuid,
  org_id uuid,
  unit_mode text,
  category text,
  pricing_type text DEFAULT 'fixed'::text,
  paryushan_day integer,
  CONSTRAINT general_heads_pkey PRIMARY KEY (id),
  CONSTRAINT general_heads_event_id_fkey FOREIGN KEY (event_id) REFERENCES dr_events(id) ON DELETE CASCADE,
  CONSTRAINT general_heads_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id),
  CONSTRAINT general_heads_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES dr_general_heads(id),
  CONSTRAINT dr_general_heads_pricing_type_check CHECK ((pricing_type = ANY (ARRAY['fixed'::text, 'auction'::text])))
);

ALTER TABLE public.dr_general_heads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view general heads" ON public.dr_general_heads
  FOR SELECT TO public USING (org_id = dr_current_org_id());
CREATE POLICY "Public can read Demo Sangh general_heads" ON public.dr_general_heads
  FOR SELECT TO anon, authenticated USING (org_id = 'd3d3d3d3-1111-2222-3333-444455556666'::uuid);
CREATE POLICY "Own org admin can manage general heads" ON public.dr_general_heads
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));


-- ───────────────────────────────────────────────────────────────
-- dr_swapna / dr_swapna_items — the auction-price donation tree
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_swapna (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid,
  name text NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  sort_order integer DEFAULT 0,
  parent_id uuid,
  org_id uuid,
  unit_mode text,
  rate_per_mun numeric,
  category text,
  pricing_type text DEFAULT 'auction'::text,
  paryushan_day integer,
  CONSTRAINT swapna_pkey PRIMARY KEY (id),
  CONSTRAINT swapna_event_id_fkey FOREIGN KEY (event_id) REFERENCES dr_events(id) ON DELETE CASCADE,
  CONSTRAINT swapna_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id),
  CONSTRAINT swapna_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES dr_swapna(id),
  CONSTRAINT dr_swapna_pricing_type_check CHECK ((pricing_type = ANY (ARRAY['fixed'::text, 'auction'::text]))),
  CONSTRAINT dr_swapna_unit_mode_check CHECK ((unit_mode = ANY (ARRAY['rupees'::text, 'mun'::text])))
);

ALTER TABLE public.dr_swapna ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view swapna" ON public.dr_swapna
  FOR SELECT TO public USING (org_id = dr_current_org_id());
CREATE POLICY "Public can read Demo Sangh swapna" ON public.dr_swapna
  FOR SELECT TO anon, authenticated USING (org_id = 'd3d3d3d3-1111-2222-3333-444455556666'::uuid);
CREATE POLICY "Own org admin can manage swapna" ON public.dr_swapna
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));

CREATE TABLE public.dr_swapna_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  swapna_id uuid,
  name text NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  sort_order integer DEFAULT 0,
  org_id uuid,
  unit_mode text,
  rate_per_mun numeric,
  category text,
  pricing_type text DEFAULT 'auction'::text,
  CONSTRAINT swapna_items_pkey PRIMARY KEY (id),
  CONSTRAINT swapna_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id),
  CONSTRAINT swapna_items_swapna_id_fkey FOREIGN KEY (swapna_id) REFERENCES dr_swapna(id) ON DELETE CASCADE,
  CONSTRAINT dr_swapna_items_pricing_type_check CHECK ((pricing_type = ANY (ARRAY['fixed'::text, 'auction'::text]))),
  CONSTRAINT dr_swapna_items_unit_mode_check CHECK ((unit_mode = ANY (ARRAY['rupees'::text, 'mun'::text])))
);

ALTER TABLE public.dr_swapna_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view swapna items" ON public.dr_swapna_items
  FOR SELECT TO public USING (org_id = dr_current_org_id());
CREATE POLICY "Public can read Demo Sangh swapna_items" ON public.dr_swapna_items
  FOR SELECT TO anon, authenticated USING (org_id = 'd3d3d3d3-1111-2222-3333-444455556666'::uuid);
CREATE POLICY "Own org admin can manage swapna items" ON public.dr_swapna_items
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));


-- ───────────────────────────────────────────────────────────────
-- dr_functions / dr_function_passes — separate event-day pass system
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_functions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  event_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dr_functions_pkey PRIMARY KEY (id),
  CONSTRAINT dr_functions_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id) ON DELETE CASCADE
);

ALTER TABLE public.dr_functions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dr_functions admin manage" ON public.dr_functions
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));

CREATE TABLE public.dr_function_passes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  function_id uuid NOT NULL,
  family_no text NOT NULL,
  allowed_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dr_function_passes_pkey PRIMARY KEY (id),
  CONSTRAINT dr_function_passes_function_id_fkey FOREIGN KEY (function_id) REFERENCES dr_functions(id) ON DELETE CASCADE,
  CONSTRAINT dr_function_passes_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id) ON DELETE CASCADE,
  CONSTRAINT dr_function_passes_function_id_family_no_key UNIQUE (function_id, family_no)
);

ALTER TABLE public.dr_function_passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dr_function_passes admin manage" ON public.dr_function_passes
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));


-- ───────────────────────────────────────────────────────────────
-- dr_members / dr_family_individuals — the org's family roster
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  family_no text NOT NULL,
  person_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  phone_no text,
  address text,
  family_member_count integer,
  org_id uuid,
  is_head boolean DEFAULT false,
  CONSTRAINT members_pkey PRIMARY KEY (id),
  CONSTRAINT members_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id)
);
CREATE INDEX idx_members_family_no ON public.dr_members USING btree (family_no);
CREATE INDEX idx_members_person_name ON public.dr_members USING btree (person_name);

ALTER TABLE public.dr_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view members" ON public.dr_members
  FOR SELECT TO public USING (org_id = dr_current_org_id());
CREATE POLICY "Own org can add members" ON public.dr_members
  FOR INSERT TO public WITH CHECK (org_id = dr_current_org_id());
CREATE POLICY "Public can read Demo Sangh members" ON public.dr_members
  FOR SELECT TO anon, authenticated USING (org_id = 'd3d3d3d3-1111-2222-3333-444455556666'::uuid);
CREATE POLICY "Own org admin can manage members" ON public.dr_members
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));

CREATE TABLE public.dr_family_individuals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  family_no text NOT NULL,
  person_name text NOT NULL,
  phone text,
  is_head boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dr_family_individuals_pkey PRIMARY KEY (id),
  CONSTRAINT dr_family_individuals_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id)
);

ALTER TABLE public.dr_family_individuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view family individuals" ON public.dr_family_individuals
  FOR SELECT TO public USING (org_id = dr_current_org_id());
CREATE POLICY "Own org can add family individuals" ON public.dr_family_individuals
  FOR INSERT TO public WITH CHECK (org_id = dr_current_org_id());
CREATE POLICY "Own org admin can manage family individuals" ON public.dr_family_individuals
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));


-- ───────────────────────────────────────────────────────────────
-- dr_receipt_counters / dr_token_counters — per-org sequential number
-- source, mutated only via dr_next_receipt_no()/dr_next_token_no()
-- (bottom of file) so numbers never collide or skip under concurrency.
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_receipt_counters (
  org_id uuid NOT NULL,
  next_no integer NOT NULL DEFAULT 1,
  CONSTRAINT dr_receipt_counters_pkey PRIMARY KEY (org_id),
  CONSTRAINT dr_receipt_counters_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id)
);

ALTER TABLE public.dr_receipt_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view receipt counter" ON public.dr_receipt_counters
  FOR SELECT TO public USING (org_id = dr_current_org_id());

CREATE TABLE public.dr_token_counters (
  org_id uuid NOT NULL,
  next_no integer NOT NULL DEFAULT 1,
  CONSTRAINT dr_token_counters_pkey PRIMARY KEY (org_id),
  CONSTRAINT dr_token_counters_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id)
);

ALTER TABLE public.dr_token_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view token counter" ON public.dr_token_counters
  FOR SELECT TO public USING (org_id = dr_current_org_id());


-- ───────────────────────────────────────────────────────────────
-- dr_receipt_tokens — the "pending payment offer" a cash-counter
-- confirms before a real receipt is printed (see js/tokens.js)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_receipt_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  event_id uuid,
  member_id uuid,
  payer_name text NOT NULL,
  phone text,
  family_no text,
  total_amount numeric NOT NULL,
  mun_qty numeric,
  rate_per_mun_used numeric,
  status text NOT NULL DEFAULT 'pending'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  allocated_by uuid,
  allocated_at timestamp with time zone,
  paid_at timestamp with time zone,
  receipt_no integer,
  token_no integer,
  receipt_no_assigned_at timestamp with time zone,
  payment_mode text DEFAULT 'cash'::text,
  payment_ref text,
  CONSTRAINT dr_receipt_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT dr_receipt_tokens_event_id_fkey FOREIGN KEY (event_id) REFERENCES dr_events(id),
  CONSTRAINT dr_receipt_tokens_member_id_fkey FOREIGN KEY (member_id) REFERENCES dr_members(id),
  CONSTRAINT dr_receipt_tokens_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id),
  CONSTRAINT dr_receipt_tokens_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['cash'::text, 'online'::text]))),
  CONSTRAINT dr_receipt_tokens_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'paid_awaiting_split'::text, 'allocated'::text, 'cancelled'::text])))
);

ALTER TABLE public.dr_receipt_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view tokens" ON public.dr_receipt_tokens
  FOR SELECT TO public USING (org_id = dr_current_org_id());
CREATE POLICY "Own org can add tokens" ON public.dr_receipt_tokens
  FOR INSERT TO public WITH CHECK (org_id = dr_current_org_id());
CREATE POLICY "Own org admin can manage tokens" ON public.dr_receipt_tokens
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));

CREATE TRIGGER trg_assign_token_no BEFORE INSERT ON public.dr_receipt_tokens
  FOR EACH ROW EXECUTE FUNCTION dr_assign_token_no();


-- ───────────────────────────────────────────────────────────────
-- dr_token_splits — a token divided across multiple donor names
-- (large-auction "split receipt" feature — see js/splits.js)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_token_splits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL,
  org_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL,
  member_id uuid,
  family_no text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  receipt_no integer,
  receipt_no_assigned_at timestamp with time zone,
  payment_mode text,
  payment_ref text,
  CONSTRAINT dr_token_splits_pkey PRIMARY KEY (id),
  CONSTRAINT dr_token_splits_member_id_fkey FOREIGN KEY (member_id) REFERENCES dr_members(id),
  CONSTRAINT dr_token_splits_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id),
  CONSTRAINT dr_token_splits_token_id_fkey FOREIGN KEY (token_id) REFERENCES dr_receipt_tokens(id),
  CONSTRAINT dr_token_splits_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['cash'::text, 'online'::text])))
);

ALTER TABLE public.dr_token_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view token splits" ON public.dr_token_splits
  FOR SELECT TO public USING (org_id = dr_current_org_id());
CREATE POLICY "Own org can add token splits" ON public.dr_token_splits
  FOR INSERT TO public WITH CHECK (org_id = dr_current_org_id());
CREATE POLICY "Own org admin can manage token splits" ON public.dr_token_splits
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));


-- ───────────────────────────────────────────────────────────────
-- dr_donations — the ledger: one row per donation line, regardless
-- of which entry path created it (token, split, open pass, manual)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_donations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid,
  head_type text NOT NULL,
  swapna_item_id uuid,
  general_head_id uuid,
  member_id uuid,
  donor_name text NOT NULL,
  family_no text,
  amount numeric(10,2) NOT NULL,
  note text,
  entered_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  receipt_id uuid,
  phone text,
  swapna_id uuid,
  received_amount numeric,
  org_id uuid,
  mun_qty numeric,
  rate_per_mun_used numeric,
  receipt_name text,
  token_id uuid,
  aani_qty numeric,
  rate_per_aani_used numeric,
  receipt_no integer,
  receipt_no_assigned_at timestamp with time zone,
  payment_mode text,
  payment_ref text,
  CONSTRAINT donations_pkey PRIMARY KEY (id),
  CONSTRAINT donations_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES dr_profiles(id),
  CONSTRAINT donations_event_id_fkey FOREIGN KEY (event_id) REFERENCES dr_events(id) ON DELETE CASCADE,
  CONSTRAINT donations_general_head_id_fkey FOREIGN KEY (general_head_id) REFERENCES dr_general_heads(id) ON DELETE SET NULL,
  CONSTRAINT donations_member_id_fkey FOREIGN KEY (member_id) REFERENCES dr_members(id) ON DELETE SET NULL,
  CONSTRAINT donations_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id),
  CONSTRAINT donations_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES dr_receipts(id) ON DELETE SET NULL,
  CONSTRAINT donations_swapna_id_fkey FOREIGN KEY (swapna_id) REFERENCES dr_swapna(id),
  CONSTRAINT donations_swapna_item_id_fkey FOREIGN KEY (swapna_item_id) REFERENCES dr_swapna_items(id) ON DELETE SET NULL,
  CONSTRAINT dr_donations_split_token_id_fkey FOREIGN KEY (token_id) REFERENCES dr_receipt_tokens(id),
  CONSTRAINT donations_head_type_check CHECK ((head_type = ANY (ARRAY['swapna'::text, 'swapna_item'::text, 'general_head'::text]))),
  CONSTRAINT dr_donations_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['cash'::text, 'online'::text])))
);
CREATE INDEX idx_donations_event_id ON public.dr_donations USING btree (event_id);
CREATE INDEX idx_donations_general_head_id ON public.dr_donations USING btree (general_head_id);
CREATE INDEX idx_donations_swapna_item_id ON public.dr_donations USING btree (swapna_item_id);

ALTER TABLE public.dr_donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can view donations" ON public.dr_donations
  FOR SELECT TO public USING (org_id = dr_current_org_id());
CREATE POLICY "Own org can add donations" ON public.dr_donations
  FOR INSERT TO public WITH CHECK (org_id = dr_current_org_id());
CREATE POLICY "Public can read Demo Sangh donations" ON public.dr_donations
  FOR SELECT TO anon, authenticated USING (org_id = 'd3d3d3d3-1111-2222-3333-444455556666'::uuid);
CREATE POLICY "Own org admin can manage donations" ON public.dr_donations
  FOR ALL TO public USING (dr_is_admin_of(org_id)) WITH CHECK (dr_is_admin_of(org_id));


-- ───────────────────────────────────────────────────────────────
-- dr_receipts — legacy/manual receipt records (pre-dates the token
-- workflow above; still referenced by dr_donations.receipt_id)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid,
  member_id uuid,
  receipt_name text NOT NULL,
  family_no text,
  receipt_no text,
  payment_mode text NOT NULL DEFAULT 'pending'::text,
  bank_name text,
  utr_no text,
  total_amount numeric NOT NULL DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT false,
  notes text,
  entered_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  org_id uuid,
  CONSTRAINT receipts_pkey PRIMARY KEY (id),
  CONSTRAINT receipts_event_id_fkey FOREIGN KEY (event_id) REFERENCES dr_events(id) ON DELETE CASCADE,
  CONSTRAINT receipts_member_id_fkey FOREIGN KEY (member_id) REFERENCES dr_members(id) ON DELETE SET NULL,
  CONSTRAINT receipts_org_id_fkey FOREIGN KEY (org_id) REFERENCES dr_organizations(id)
);

ALTER TABLE public.dr_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own org can manage receipts" ON public.dr_receipts
  FOR ALL TO public USING (org_id = dr_current_org_id()) WITH CHECK (org_id = dr_current_org_id());


-- ───────────────────────────────────────────────────────────────
-- dr_demo_visitors — anonymous "tried the demo" log, not org-scoped
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public.dr_demo_visitors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT demo_visitors_pkey PRIMARY KEY (id)
);

ALTER TABLE public.dr_demo_visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log a demo visit" ON public.dr_demo_visitors
  FOR INSERT TO anon, authenticated WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- The trust root for every table's RLS above. Requires status='approved'
-- as of the 2026-09-14 fix — see
-- supabase-fix-pending-profile-privilege-escalation.sql for why.
CREATE OR REPLACE FUNCTION public.dr_current_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select org_id from dr_profiles where id = auth.uid() and status = 'approved';
$function$;

CREATE OR REPLACE FUNCTION public.dr_is_admin_of(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists(
    select 1 from dr_profiles
    where id = auth.uid() and role = 'admin' and org_id = p_org_id and status = 'approved'
  );
$function$;

-- Approving an org (status -> 'approved', done manually via the
-- Supabase dashboard today — no in-app UI or RPC for this) cascades to
-- (a) seeding default donation heads by copying a template org's tree,
-- (b) approving that org's founding admin profile.
CREATE OR REPLACE FUNCTION public.handle_org_approval()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM copy_heads_to_new_org(NEW.id);
    UPDATE dr_profiles SET status = 'approved' WHERE org_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

-- sk_org_id below is a fixed template-org UUID whose dr_swapna/
-- dr_general_heads tree gets cloned for every newly approved org.
CREATE OR REPLACE FUNCTION public.copy_heads_to_new_org(p_new_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  sk_org_id uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  new_event_id uuid;
  r RECORD;
  v_new_id uuid;
BEGIN
  INSERT INTO dr_events (name, org_id, is_live)
  VALUES ('Default Event', p_new_org_id, false)
  RETURNING id INTO new_event_id;

  DROP TABLE IF EXISTS swapna_id_map;
  CREATE TEMP TABLE swapna_id_map (old_id uuid, new_id uuid);

  FOR r IN SELECT * FROM dr_swapna WHERE org_id = sk_org_id AND parent_id IS NULL LOOP
    INSERT INTO dr_swapna (event_id, name, sort_order, parent_id, org_id)
    VALUES (new_event_id, r.name, r.sort_order, NULL, p_new_org_id)
    RETURNING id INTO v_new_id;
    INSERT INTO swapna_id_map VALUES (r.id, v_new_id);
  END LOOP;

  FOR r IN
    SELECT * FROM dr_swapna
    WHERE org_id = sk_org_id
      AND parent_id IN (SELECT old_id FROM swapna_id_map)
      AND id NOT IN (SELECT old_id FROM swapna_id_map)
  LOOP
    SELECT sm.new_id INTO v_new_id FROM swapna_id_map sm WHERE sm.old_id = r.parent_id;
    INSERT INTO dr_swapna (event_id, name, sort_order, parent_id, org_id)
    VALUES (new_event_id, r.name, r.sort_order, v_new_id, p_new_org_id)
    RETURNING id INTO v_new_id;
    INSERT INTO swapna_id_map VALUES (r.id, v_new_id);
  END LOOP;

  FOR r IN
    SELECT * FROM dr_swapna
    WHERE org_id = sk_org_id
      AND parent_id IN (SELECT old_id FROM swapna_id_map)
      AND id NOT IN (SELECT old_id FROM swapna_id_map)
  LOOP
    SELECT sm.new_id INTO v_new_id FROM swapna_id_map sm WHERE sm.old_id = r.parent_id;
    INSERT INTO dr_swapna (event_id, name, sort_order, parent_id, org_id)
    VALUES (new_event_id, r.name, r.sort_order, v_new_id, p_new_org_id)
    RETURNING id INTO v_new_id;
    INSERT INTO swapna_id_map VALUES (r.id, v_new_id);
  END LOOP;

  FOR r IN SELECT * FROM dr_swapna_items WHERE org_id = sk_org_id LOOP
    SELECT sm.new_id INTO v_new_id FROM swapna_id_map sm WHERE sm.old_id = r.swapna_id;
    INSERT INTO dr_swapna_items (swapna_id, name, sort_order, org_id)
    VALUES (v_new_id, r.name, r.sort_order, p_new_org_id);
  END LOOP;

  DROP TABLE IF EXISTS swapna_id_map;

  DROP TABLE IF EXISTS gh_id_map;
  CREATE TEMP TABLE gh_id_map (old_id uuid, new_id uuid);

  FOR r IN SELECT * FROM dr_general_heads WHERE org_id = sk_org_id AND parent_id IS NULL LOOP
    INSERT INTO dr_general_heads (name, parent_id, display_order, org_id)
    VALUES (r.name, NULL, r.display_order, p_new_org_id)
    RETURNING id INTO v_new_id;
    INSERT INTO gh_id_map VALUES (r.id, v_new_id);
  END LOOP;

  FOR r IN
    SELECT * FROM dr_general_heads
    WHERE org_id = sk_org_id
      AND parent_id IN (SELECT old_id FROM gh_id_map)
      AND id NOT IN (SELECT old_id FROM gh_id_map)
  LOOP
    SELECT gm.new_id INTO v_new_id FROM gh_id_map gm WHERE gm.old_id = r.parent_id;
    INSERT INTO dr_general_heads (name, parent_id, display_order, org_id)
    VALUES (r.name, v_new_id, r.display_order, p_new_org_id);
  END LOOP;

  DROP TABLE IF EXISTS gh_id_map;
END;
$function$;

-- Telegram/email notification the moment a founding admin's profile
-- flips to 'approved' (fired by handle_org_approval()'s UPDATE above).
CREATE OR REPLACE FUNCTION public.dr_notify_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
begin
  if NEW.status = 'approved' and OLD.status is distinct from 'approved' then
    select email into v_email from auth.users where id = NEW.id;
    if v_email is not null then
      perform net.http_post(
        url := 'https://telegram-notify.unigoods2026.workers.dev/',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object(
          'action', 'sendEmail',
          'to', v_email,
          'fromName', 'derasarboli',
          'subject', 'Your Derasar Boli Sangh registration is approved',
          'html', '<p>Namaste ' || coalesce(NEW.full_name, '') || ',</p>'
            || '<p>Your Sangh registration on <b>Derasar Boli</b> has been approved. You can now log in and start using the app:</p>'
            || '<p><a href="https://derasar-boli.anyapps.in">https://derasar-boli.anyapps.in</a></p>'
            || '<p style="font-size:13px;color:#666;">Questions? Contact vkv-coder.support@gmail.com</p>'
        )
      );
    end if;
  end if;
  return NEW;
end;
$function$;

-- Sequential per-org counters — the insert-then-update pattern
-- (on conflict do nothing, then UPDATE ... RETURNING) is what makes
-- concurrent calls hand out distinct numbers safely.
CREATE OR REPLACE FUNCTION public.dr_next_receipt_no(p_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.dr_next_token_no(p_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.dr_assign_token_no()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.token_no is null then
    new.token_no := dr_next_token_no(new.org_id);
  end if;
  return new;
end;
$function$;

-- Idempotent — safe to call repeatedly on the same row; only assigns
-- once (returns the existing number if already assigned). One of
-- these three exists per receipt-producing table (donation / token /
-- split), called from js/receipt.js's getOrAssignReceiptNo().
CREATE OR REPLACE FUNCTION public.dr_assign_receipt_no_donation(p_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_existing integer;
  v_no integer;
begin
  select org_id, receipt_no into v_org, v_existing from dr_donations where id = p_id;
  if v_org is null then return null; end if;
  if v_existing is not null then return v_existing; end if;
  v_no := dr_next_receipt_no(v_org);
  update dr_donations set receipt_no = v_no, receipt_no_assigned_at = now() where id = p_id;
  return v_no;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dr_assign_receipt_no_token(p_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_existing integer;
  v_no integer;
begin
  select org_id, receipt_no into v_org, v_existing from dr_receipt_tokens where id = p_id;
  if v_org is null then return null; end if;
  if v_existing is not null then return v_existing; end if;
  v_no := dr_next_receipt_no(v_org);
  update dr_receipt_tokens set receipt_no = v_no, receipt_no_assigned_at = now() where id = p_id;
  return v_no;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dr_assign_receipt_no_split(p_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_existing integer;
  v_no integer;
begin
  select org_id, receipt_no into v_org, v_existing from dr_token_splits where id = p_id;
  if v_org is null then return null; end if;
  if v_existing is not null then return v_existing; end if;
  v_no := dr_next_receipt_no(v_org);
  update dr_token_splits set receipt_no = v_no, receipt_no_assigned_at = now() where id = p_id;
  return v_no;
end;
$function$;

REVOKE ALL ON FUNCTION public.dr_assign_receipt_no_donation(uuid) FROM public;
REVOKE ALL ON FUNCTION public.dr_assign_receipt_no_token(uuid) FROM public;
REVOKE ALL ON FUNCTION public.dr_assign_receipt_no_split(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.dr_assign_receipt_no_donation(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dr_assign_receipt_no_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dr_assign_receipt_no_split(uuid) TO anon, authenticated;

-- Auto-generates the next family_no (e.g. "S12") for a new family head
-- entered via the public "Add Member" form — see js/donations.js.
CREATE OR REPLACE FUNCTION public.dr_add_member_from_form(p_org_id uuid, p_head_name text, p_phone text, p_total_members integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_letter text;
  v_max int;
  v_family_no text;
begin
  v_letter := upper(left(trim(p_head_name), 1));
  if v_letter is null or v_letter = '' then
    raise exception 'head name is required';
  end if;

  select coalesce(max((regexp_match(family_no, '^' || v_letter || '(\d+)$'))[1]::int), 0)
    into v_max
    from dr_members
    where org_id = p_org_id
      and family_no ~ ('^' || v_letter || '\d+$');

  v_family_no := v_letter || (v_max + 1)::text;

  insert into dr_members (org_id, person_name, family_no, phone_no, family_member_count)
  values (p_org_id, trim(p_head_name), v_family_no, nullif(trim(p_phone), ''), p_total_members);

  return v_family_no;
end;
$function$;

-- Admin-only "delete a head and everything under it" (Heads Setup UI).
-- p_table is validated against an allowlist before being interpolated,
-- so this isn't SQL-injectable via that parameter.
CREATE OR REPLACE FUNCTION public.dr_delete_head_recursive(p_table text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_ids uuid[];
begin
  if p_table not in ('dr_general_heads', 'dr_swapna') then
    raise exception 'Invalid table: %', p_table;
  end if;

  execute format(
    'with recursive descendants as (
       select id from %I where id = $1
       union all
       select t.id from %I t join descendants d on t.parent_id = d.id
     )
     select array_agg(id) from descendants', p_table, p_table
  ) into v_ids using p_id;

  execute format('delete from %I where id = any($1)', p_table) using v_ids;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- End of dump. Known gaps (see supabase-fix-pending-profile-privilege-
-- escalation.sql's "Not done here" section for the security ones):
--   • Self-service dr_profiles INSERT/UPDATE still don't restrict
--     org_id to an org the signer-upper actually just created.
--   • "Public can read pending organizations" is open to anon/
--     authenticated — minor info leak of not-yet-approved temple
--     names, not a data-access issue.
--   • Org approval (status -> 'approved') has no in-app UI or RPC —
--     done by hand via the Supabase dashboard today.
-- ═══════════════════════════════════════════════════════════════
