-- Detailed per-member Add/Edit: dr_family_individuals gains DOB, Age,
-- Gender, and Phone per person (name-only before), mirroring the Google
-- Form's M1-M8 layout so any Sangh without a Google Form of their own can
-- capture the same detail directly in the app.
--
-- Age is its own column, not purely computed from dob — many members
-- (especially older ones) know their approximate age but not their exact
-- DOB. When DOB IS entered, the UI auto-fills Age from it as a convenience
-- (calcAge() in js/members.js), but Age stays independently editable and is
-- what actually gets saved — same behavior as the source Google Form
-- itself (a typed age is a snapshot as of entry time, not recomputed later).

alter table dr_family_individuals add column if not exists dob date;
alter table dr_family_individuals add column if not exists age integer;
alter table dr_family_individuals add column if not exists gender text;
alter table dr_family_individuals add column if not exists phone_no text;
