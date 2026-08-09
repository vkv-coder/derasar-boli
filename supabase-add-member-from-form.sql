-- Called from the Harinagar Sangh registration Apps Script (doPost) whenever
-- a new family registers, so the app's Members list stays in sync without
-- manual re-import. Continues the SAME fresh no-hyphen sequence (A1, B1...)
-- started by the 2026-08-05 bulk import — deliberately separate from the
-- pre-existing hyphenated A-1/B-1... family numbers, so duplicates against
-- old records stay easy to spot on sight, per the user's explicit choice.
-- SECURITY DEFINER so it's callable with just the anon key (Apps Script has
-- no user session) — same pattern as sportbook's register_player_and_send_otp
-- on this shared project.
create or replace function dr_add_member_from_form(
  p_org_id uuid,
  p_head_name text,
  p_phone text,
  p_total_members int
) returns text
language plpgsql
security definer
as $$
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
$$;

grant execute on function dr_add_member_from_form(uuid, text, text, int) to anon, authenticated;
