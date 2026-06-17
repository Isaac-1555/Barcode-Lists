CREATE TABLE category_order (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  position INTEGER NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, category_name)
);

ALTER TABLE category_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_own_store" ON category_order
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TABLE copied_barcodes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  barcode_value TEXT NOT NULL,
  copied BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, barcode_value)
);

ALTER TABLE copied_barcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_own_store" ON copied_barcodes
  FOR ALL
  USING (true)
  WITH CHECK (true);
