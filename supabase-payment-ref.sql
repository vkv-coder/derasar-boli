-- Chq/UPI reference number captured whenever payment_mode='online', so it
-- can print on the receipt (user request 2026-09-08: "if online then
-- chq/upi no ___ should be there"). Mirrors how payment_mode itself was
-- added in supabase-payment-mode.sql — same 3 tables, same copy points.

alter table dr_receipt_tokens add column if not exists payment_ref text;
alter table dr_token_splits add column if not exists payment_ref text;
alter table dr_donations add column if not exists payment_ref text;
