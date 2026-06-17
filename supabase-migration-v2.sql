-- ==========================================
-- DERASAR BOLI - Migration v2.1
-- Global heads: make event_id optional
-- Run ONCE in Supabase SQL Editor
-- ==========================================

-- 1. General heads no longer require an event
ALTER TABLE general_heads ALTER COLUMN event_id DROP NOT NULL;

-- 2. Swapna no longer requires an event
ALTER TABLE swapna ALTER COLUMN event_id DROP NOT NULL;

-- 3. Donations event is optional
ALTER TABLE donations ALTER COLUMN event_id DROP NOT NULL;

-- 4. Receipts event is optional
ALTER TABLE receipts ALTER COLUMN event_id DROP NOT NULL;

-- Done. Verify:
SELECT 'Migration v2.1 applied — event_id is now optional in all tables' AS status;
