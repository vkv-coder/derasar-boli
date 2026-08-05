-- The person paying (donor_name/member) isn't always who the receipt should
-- be printed for — e.g. a member pays, but wants the receipt in the name of
-- a deceased parent. receipt_name is optional; entry/report/collection views
-- keep using donor_name (the actual payer, who you collect from), only the
-- printed receipt prefers receipt_name when set.
alter table dr_donations add column if not exists receipt_name text;
