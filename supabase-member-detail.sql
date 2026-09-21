-- Detailed per-member Add/Edit: dr_family_individuals gains DOB, Gender,
-- and Phone per person (name-only before), mirroring the Google Form's
-- M1-M8 layout so any Sangh without a Google Form of their own can capture
-- the same detail directly in the app. Age is deliberately NOT stored -
-- always computed from dob client-side (calcAge() in js/members.js) so it
-- never goes stale.

alter table dr_family_individuals add column if not exists dob date;
alter table dr_family_individuals add column if not exists gender text;
alter table dr_family_individuals add column if not exists phone_no text;
