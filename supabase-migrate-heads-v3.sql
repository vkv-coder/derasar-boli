-- ================================================
-- Derasar Boli - Heads Migration v3
-- Adds parent_id for main/sub-head structure
-- Run in Supabase SQL Editor
-- ================================================

-- Step 1: Add parent_id column (safe to run even if column exists)
ALTER TABLE general_heads ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES general_heads(id);

-- Step 2: Remove old global heads
-- WARNING: Only run if no donations reference these heads yet
DELETE FROM general_heads WHERE event_id IS NULL;

-- Step 3: Insert 6 main heads + 10 sub-heads of Sadharan
WITH mains AS (
  INSERT INTO general_heads (name, display_order, event_id, parent_id) VALUES
    ('સાધારણ',  1, NULL, NULL),
    ('દેવદ્રવ્ય', 2, NULL, NULL),
    ('જીવદયા',  3, NULL, NULL),
    ('જ્ઞાન',     4, NULL, NULL),
    ('વૈયાવચ',5, NULL, NULL),
    ('આંગી',    6, NULL, NULL)
  RETURNING id, name
)
INSERT INTO general_heads (name, display_order, event_id, parent_id)
SELECT v.name, v.ord, NULL, m.id
FROM (VALUES
  ('સ્વપ્ન ફંડ',   1, 'સાધારણ'),
  ('સાધર્મિક ભક્તિ',  2, 'સાધારણ'),
  ('સ્વામીવાત્સલ્ય', 3, 'સાધારણ'),
  ('આયંબિલ',        4, 'સાધારણ'),
  ('પાઠશાળા',       5, 'સાધારણ'),
  ('પ્રભાવના',      6, 'સાધારણ'),
  ('બહુમાન',        7, 'સાધારણ'),
  ('અનુકંપા દાન',   8, 'સાધારણ'),
  ('દેરાસર નિભાવણી',  9, 'સાધારણ'),
  ('સભ્ય અનુદાન',  10, 'સાધારણ')
) AS v(name, ord, parent_name)
JOIN mains m ON m.name = v.parent_name;

-- Verify
SELECT
  CASE WHEN parent_id IS NULL THEN '>> MAIN' ELSE '   sub' END AS type,
  name, display_order
FROM general_heads
WHERE event_id IS NULL
ORDER BY COALESCE(parent_id::text, id::text), display_order;
