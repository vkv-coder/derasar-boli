-- Cash vs Online payment tracking, so the cash-counter admin can reconcile
-- the physical cash box separately from UPI/bank-transfer receipts.
-- Lives on dr_receipt_tokens (set once, when marking received) and is
-- copied onto dr_token_splits / dr_donations at the same points receipt_no
-- already gets copied, so the Receipt Register can read it directly off
-- each row without a join.

alter table dr_receipt_tokens add column if not exists payment_mode text check (payment_mode in ('cash','online')) default 'cash';
alter table dr_token_splits add column if not exists payment_mode text check (payment_mode in ('cash','online'));
alter table dr_donations add column if not exists payment_mode text check (payment_mode in ('cash','online'));

update dr_receipt_tokens set payment_mode = 'cash' where payment_mode is null;
