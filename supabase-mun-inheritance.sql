-- Rupees/Mun now inherits down the swapna tree: setting it on a main head
-- (or any sub-head) applies to everything beneath it, unless a lower level
-- explicitly overrides. Requires unit_mode to distinguish "never set, inherit
-- from parent" (NULL) from "explicitly Rupees" (was previously indistinguishable
-- from the unset default). Resetting existing rows to NULL is safe here —
-- the mixed-mode toggle only just shipped, so no row represents a deliberate
-- per-head choice yet.
alter table dr_swapna alter column unit_mode drop default;
alter table dr_swapna alter column unit_mode drop not null;
update dr_swapna set unit_mode = null where unit_mode = 'rupees';

alter table dr_swapna_items alter column unit_mode drop default;
alter table dr_swapna_items alter column unit_mode drop not null;
update dr_swapna_items set unit_mode = null where unit_mode = 'rupees';
