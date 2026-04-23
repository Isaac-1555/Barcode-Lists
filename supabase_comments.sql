-- Create barcode_comments table for Chrome extension comments feature
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS barcode_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  barcode_value text NOT NULL,
  comment text CHECK (char_length(comment) <= 250),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, barcode_value)
);

-- Enable RLS
ALTER TABLE barcode_comments ENABLE ROW LEVEL SECURITY;

-- Policy for anon access (matching barcodes table)
CREATE POLICY "Allow anonymous access" ON barcode_comments
  FOR SELECT USING (true)
  FOR INSERT WITH CHECK (true)
  FOR UPDATE USING (true)
  FOR DELETE USING (true);

-- Index for lookups
CREATE INDEX idx_barcode_comments_store_barcode ON barcode_comments(store_id, barcode_value);