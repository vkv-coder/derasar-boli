-- ==========================================
-- DERASAR BOLI - Migration v2
-- Run this ONCE in Supabase SQL Editor
-- ==========================================

-- 1. New receipts table (groups multiple heads under one receipt)
CREATE TABLE IF NOT EXISTS receipts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id     UUID REFERENCES members(id) ON DELETE SET NULL,
  receipt_name  TEXT NOT NULL,
  family_no     TEXT,
  receipt_no    TEXT,
  payment_mode  TEXT NOT NULL DEFAULT 'pending', -- cash | cheque | online | pending
  bank_name     TEXT,
  utr_no        TEXT,
  total_amount  NUMERIC NOT NULL DEFAULT 0,
  is_paid       BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT,
  entered_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable RLS and allow authenticated users full access
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on receipts"
  ON receipts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Link donations to receipts (nullable – old rows will be NULL)
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL;

-- Done. Verify:
SELECT 'receipts table created' AS status;
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'donations' AND column_name = 'receipt_id';
