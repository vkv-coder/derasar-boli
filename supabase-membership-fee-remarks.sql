-- Adds a Remarks field to Membership Fee entries. Manual receipt numbers
-- (for this year, already issued from the paper book before this feature
-- existed) reuse the existing receipt_no/receipt_no_assigned_at columns
-- already on dr_membership_fees - no schema change needed for that part,
-- getOrAssignReceiptNo() in js/receipt.js already skips auto-assigning
-- when receipt_no is non-null.

alter table dr_membership_fees add column if not exists remarks text;
