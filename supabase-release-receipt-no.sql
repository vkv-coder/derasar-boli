-- Best-effort "give back" of a receipt number when a token is cancelled
-- before it was truly handed to anyone. receipt_no gets assigned the moment
-- a receipt is PREVIEWED (getOrAssignReceiptNo in js/receipt.js), not when
-- an actual print is confirmed — there's no reliable JS callback for "user
-- actually printed" vs "user cancelled the print dialog". So cancelling
-- right after previewing would otherwise permanently waste that number and
-- leave a gap in the sequence.
--
-- Only releases if p_no is still exactly the tail of the sequence (nothing
-- issued since) — otherwise a later receipt already exists downstream and
-- renumbering it would be wrong, so the gap is correctly left as-is.
create or replace function dr_release_receipt_no(p_org_id uuid, p_no integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  update dr_receipt_counters
  set next_no = next_no - 1
  where org_id = p_org_id and next_no = p_no + 1;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function dr_release_receipt_no(uuid, integer) from public;
grant execute on function dr_release_receipt_no(uuid, integer) to anon, authenticated;
