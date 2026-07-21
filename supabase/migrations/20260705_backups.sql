-- ── Backups metadata table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS backups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        TEXT,                 -- user-friendly name
  storage_path TEXT NOT NULL,        -- path in Supabase Storage bucket
  size_bytes   BIGINT DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | ready | error
  error        TEXT,
  entity_counts JSONB,               -- { customers: 12, products: 45, ... }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_backups_company_created
  ON backups (company_id, created_at DESC) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backups_select_owner"
  ON backups FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "backups_insert_owner"
  ON backups FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "backups_update_owner"
  ON backups FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ── Storage bucket (run via Supabase dashboard or service client) ─────────────
-- INSERT INTO storage.buckets (id, name, public, file_size_limit)
-- VALUES ('backups', 'backups', false, 104857600)  -- 100MB limit
-- ON CONFLICT (id) DO NOTHING;
