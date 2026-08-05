-- Extends the Rupees/Mun cascading toggle (already on dr_swapna/dr_swapna_items)
-- to General Donation Heads too, per user request. Same nullable-means-inherit
-- model: NULL = inherit from parent (or org root default), 'rupees'/'mun' =
-- explicit override at that head.
alter table dr_general_heads add column if not exists unit_mode text;
