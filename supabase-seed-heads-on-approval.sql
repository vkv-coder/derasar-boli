-- On a new Sangh's first approval (dr_profiles.status flips to 'approved' for
-- the very first time, and that org has zero dr_general_heads so far), clone
-- the full Heads Setup starter kit from the live Harinagar Sangh template org
-- (a1b2c3d4-e5f6-7890-abcd-ef1234567890 — 8 main heads + 19 sub-heads + 89
-- Swapna heads + its 1 Paryushan event) into the new org. The new admin can
-- then freely edit/delete/add main heads, sub-heads, and Swapna heads — same
-- as the template org always could, this just means they don't start empty.
--
-- Same trigger table/pattern as dr_notify_approval() in supabase-notify-approval.sql.

create or replace function dr_seed_heads_on_approval() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_org uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  v_event_map jsonb := '{}'::jsonb;
  v_head_map jsonb := '{}'::jsonb;
  v_swapna_map jsonb := '{}'::jsonb;
  r record;
  v_new_id uuid;
  v_guard int := 0;
begin
  if NEW.org_id is null then return NEW; end if;
  if NEW.org_id = v_template_org then return NEW; end if;
  if NEW.status <> 'approved' or OLD.status is not distinct from 'approved' then return NEW; end if;

  -- idempotency: never seed an org that already has any heads (covers a
  -- later unrelated status update on the same profile, and double-firing)
  if exists (select 1 from dr_general_heads where org_id = NEW.org_id) then
    return NEW;
  end if;

  -- 1. Clone the template's event(s) — forced to Draft (is_live=false) and no
  --    date, since last year's live Paryushan date/live-flag isn't a sane
  --    default for a brand-new Sangh. Needed so cloned Swapna heads have a
  --    real event to attach to and are usable in Donation Entry immediately.
  for r in select * from dr_events where org_id = v_template_org loop
    v_new_id := gen_random_uuid();
    insert into dr_events (id, org_id, name, event_date, is_live)
      values (v_new_id, NEW.org_id, r.name, null, false);
    v_event_map := v_event_map || jsonb_build_object(r.id::text, v_new_id::text);
  end loop;

  -- 2. Clone General Heads — main heads (parent_id is null) first, then
  --    sub-heads, remapping parent_id via v_head_map.
  for r in select * from dr_general_heads where org_id = v_template_org and parent_id is null order by display_order loop
    v_new_id := gen_random_uuid();
    insert into dr_general_heads (id, org_id, name, parent_id, event_id, display_order, unit_mode, category, pricing_type, paryushan_day, fee_type, unit_price)
      values (v_new_id, NEW.org_id, r.name, null, null, r.display_order, r.unit_mode, r.category, r.pricing_type, r.paryushan_day, r.fee_type, r.unit_price);
    v_head_map := v_head_map || jsonb_build_object(r.id::text, v_new_id::text);
  end loop;

  for r in select * from dr_general_heads where org_id = v_template_org and parent_id is not null order by display_order loop
    v_new_id := gen_random_uuid();
    insert into dr_general_heads (id, org_id, name, parent_id, event_id, display_order, unit_mode, category, pricing_type, paryushan_day, fee_type, unit_price)
      values (v_new_id, NEW.org_id, r.name, (v_head_map->>r.parent_id::text)::uuid, null, r.display_order, r.unit_mode, r.category, r.pricing_type, r.paryushan_day, r.fee_type, r.unit_price);
    v_head_map := v_head_map || jsonb_build_object(r.id::text, v_new_id::text);
  end loop;

  -- 3. Clone Swapna heads tree, wave by wave (root nodes first, then any
  --    node whose parent was already cloned) so arbitrarily deep nesting is
  --    handled without hardcoding a depth. v_guard caps iterations so a
  --    stray orphaned parent_id can never spin this into an infinite loop.
  while exists (
    select 1 from dr_swapna
    where org_id = v_template_org and not (v_swapna_map ? id::text)
  ) and v_guard < 20 loop
    v_guard := v_guard + 1;
    for r in
      select * from dr_swapna
      where org_id = v_template_org
        and not (v_swapna_map ? id::text)
        and (parent_id is null or v_swapna_map ? parent_id::text)
      order by sort_order
    loop
      v_new_id := gen_random_uuid();
      insert into dr_swapna (id, org_id, event_id, name, parent_id, display_order, sort_order, unit_mode, rate_per_mun, category, pricing_type, paryushan_day)
        values (
          v_new_id, NEW.org_id,
          case when r.event_id is not null then (v_event_map->>r.event_id::text)::uuid else null end,
          r.name,
          case when r.parent_id is not null then (v_swapna_map->>r.parent_id::text)::uuid else null end,
          r.display_order, r.sort_order, r.unit_mode, r.rate_per_mun, r.category, r.pricing_type, r.paryushan_day
        );
      v_swapna_map := v_swapna_map || jsonb_build_object(r.id::text, v_new_id::text);
    end loop;
  end loop;

  -- 4. Clone Swapna items (leaf offerings under a Swapna head).
  for r in select * from dr_swapna_items where org_id = v_template_org loop
    insert into dr_swapna_items (id, org_id, swapna_id, name, display_order, sort_order, unit_mode, rate_per_mun, category, pricing_type)
      values (gen_random_uuid(), NEW.org_id, (v_swapna_map->>r.swapna_id::text)::uuid, r.name, r.display_order, r.sort_order, r.unit_mode, r.rate_per_mun, r.category, r.pricing_type);
  end loop;

  return NEW;
end;
$$;

drop trigger if exists dr_profiles_seed_heads_on_approval on dr_profiles;
create trigger dr_profiles_seed_heads_on_approval
after update on dr_profiles
for each row execute function dr_seed_heads_on_approval();
