-- Deleting a head/group that has sub-heads/children fails with a foreign
-- key violation (parent_id self-reference is NO ACTION, not CASCADE, by
-- design — we don't want an accidental blanket cascade wiping out a whole
-- tree via schema-level defaults). This RPC does the cascade explicitly and
-- atomically instead: find every descendant via a recursive CTE, then
-- delete the whole set in one statement. If any descendant still has real
-- donations against it (dr_donations FKs stay NO ACTION), the delete fails
-- and rolls back entirely — nothing gets half-deleted.
create or replace function dr_delete_head_recursive(p_table text, p_id uuid)
returns void
language plpgsql
as $$
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
$$;

grant execute on function dr_delete_head_recursive(text, uuid) to authenticated;
