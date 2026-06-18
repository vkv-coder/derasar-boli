-- Members table: add phone_no, address, family_member_count
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone_no TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS family_member_count INTEGER;

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'members' ORDER BY ordinal_position;
