CREATE TABLE important_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, category_name)
);

ALTER TABLE important_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_own_store" ON important_categories
  FOR ALL
  USING (true)
  WITH CHECK (true);
