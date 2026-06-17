-- Rename English donation heads to Gujarati
-- Run in Supabase SQL Editor

UPDATE general_heads SET name = 'જીવદયા' WHERE LOWER(name) LIKE '%jivdaya%';
UPDATE general_heads SET name = 'સાધારણ' WHERE LOWER(name) LIKE '%sadharan%';
UPDATE general_heads SET name = 'અંગી' WHERE LOWER(name) LIKE '%angi%';
UPDATE general_heads SET name = 'ઓઠ-ઓઢ' WHERE LOWER(name) LIKE '%otnere%';
UPDATE general_heads SET name = 'સ્વામીવાત્સલ્ય કૂપન' WHERE LOWER(name) LIKE '%swamivatsalya%';
UPDATE general_heads SET name = 'નવી સભ્ય ફી' WHERE LOWER(name) LIKE '%new member%';
UPDATE general_heads SET name = 'સભ્ય નવીનીકરણ ફી' WHERE LOWER(name) LIKE '%renewal%';
UPDATE general_heads SET name = 'નિષ્ઠળ ભંડાર' WHERE LOWER(name) LIKE '%nishal%';

-- Verify
SELECT id, name FROM general_heads WHERE event_id IS NULL ORDER BY display_order;