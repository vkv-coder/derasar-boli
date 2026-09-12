-- Tags each general/swapna head with which Paryushan day it belongs to,
-- per the printed "head display for donation" master list (2026-09-12,
-- Sr 1-111, columns: Sr No/Name/Type/Category/Days). Drives the new
-- Donation Entry UI: Day 1 heads (evergreen general heads) stay always
-- visible; Days 3/5/7/8 (festival-day-specific chadhavo) sit behind a
-- dropdown instead of cluttering the page with ~90 mostly-irrelevant-
-- today items.

alter table dr_general_heads add column if not exists paryushan_day integer;
alter table dr_swapna add column if not exists paryushan_day integer;

-- Backfill: 110 of 111 sheet rows matched an existing head by name (after
-- stripping "(paryushan 2026)" suffixes and mapping a handful of
-- English-only category labels - Sadharan khate, Gyan Khate, etc. - to
-- their existing Gujarati rows). The 111th (Sr 93, Day 7) had a garbled
-- transliterated name with no existing match; created fresh as a new
-- dr_swapna row instead (see below). One further dr_swapna row
-- ("જ્ઞાનની પાંચ પૂજાનો ચઢાવો", the umbrella parent for 5 heads that turned
-- out to already exist as independent top-level entries) was never
-- referenced by its own line in the sheet - left with paryushan_day NULL,
-- intentionally excluded from every day tab.

-- Day 1 (14 general heads) — see js/donations.js loadDay1HeadsEntry()
-- Day 3 (1 general head "સાધર્મિક ભક્તિ ખાતે" + 7 swapna)
-- Day 5 (8 general heads, incl. all 8 Ashtamangal + 53 swapna)
-- Day 7 (9 swapna + 1 newly created: "વરઘોડો ઊતરે ત્યારે પ્રભુ ને પોંખવાનો ચડાવો")
-- Day 8 (18 swapna)
-- Actual UPDATE statements run directly via `supabase db query` during
-- the live session (2026-09-12) rather than committed here verbatim,
-- since they're 110 explicit id-list updates generated from the sheet
-- match — this file documents the column/shape for future reference.
